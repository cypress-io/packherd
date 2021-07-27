import debug from 'debug'
import { Benchmark, setupBenchmark } from './benchmark'
import { DefaultTranspileCache } from './default-transpile-cache'
import { ModuleLoaderOpts, PackherdModuleLoader } from './loader'
import { installSourcemapSupport } from './sourcemap-support'
import type { PackherdTranspileOpts, SourceMapLookup } from './types'

const logInfo = debug('packherd:info')
const logDebug = debug('packherd:debug')
const logTrace = debug('packherd:trace')
const logError = debug('packherd:error')

export * from './loader'
export type PackherdRequireOpts = ModuleLoaderOpts & {
  requireStatsFile?: string
  transpileOpts?: Partial<PackherdTranspileOpts>
  sourceMapLookup?: SourceMapLookup
}

const DEFAULT_TRANSPILE_OPTS = {
  supportTS: false,
}

export function packherdRequire(
  projectBaseDir: string,
  opts: PackherdRequireOpts
) {
  const Module = require('module')

  const { supportTS, initTranspileCache, tsconfig } = Object.assign(
    {},
    DEFAULT_TRANSPILE_OPTS,
    opts.transpileOpts
  )
  const diagnostics = opts.diagnostics ?? false

  const cache =
    initTranspileCache == null
      ? new DefaultTranspileCache()
      : initTranspileCache(projectBaseDir, {
          cacheDir: '/tmp/packherd-cache',
        }) ?? new DefaultTranspileCache()

  if (supportTS) {
    logInfo('Enabling TS support')
    logDebug({ supportTS, initTranspileCache, tsconfig })
    const { hookTranspileTs } = require('./transpile-ts')

    hookTranspileTs(
      Module,
      projectBaseDir,
      logInfo,
      diagnostics,
      cache,
      opts.sourceMapLookup,
      tsconfig
    )
  } else {
    installSourcemapSupport(cache, projectBaseDir, opts.sourceMapLookup)
  }

  const exportKeysLen =
    opts.moduleExports != null ? Object.keys(opts.moduleExports).length : 0
  const definitionKeysLen =
    opts.moduleDefinitions != null
      ? Object.keys(opts.moduleDefinitions).length
      : 0
  logInfo(
    'packherd defining %d exports and %d definitions!',
    exportKeysLen,
    definitionKeysLen
  )
  logInfo({ projectBaseDir })

  // Even though packherd is designed to support loading from these caches we
  // also support using it for on the fly TypeScript transpilation only.
  // In that case the necessary extensions hook was applied above and no
  // further work is needed.
  if (exportKeysLen === 0 && definitionKeysLen === 0) {
    logInfo(
      'No moduleExports nor moduleDefinitions provided, not hooking Module._load'
    )
    return
  }

  const benchmark: Benchmark = setupBenchmark(
    projectBaseDir,
    opts.requireStatsFile
  )

  const origLoad = Module._load

  const moduleLoader = new PackherdModuleLoader(
    Module,
    origLoad,
    projectBaseDir,
    benchmark,
    opts
  )

  //
  // Module._load override
  //
  Module._load = function (
    moduleUri: string,
    parent: typeof Module,
    isMain: boolean
  ) {
    logTrace('Module._load "%s"', moduleUri)
    if (Module.builtinModules.includes(moduleUri)) {
      return origLoad(moduleUri, parent, isMain)
    }
    try {
      const {
        resolved,
        origin,
        exports,
        fullPath,
        moduleRelativePath,
      } = moduleLoader.tryLoad(moduleUri, parent, isMain)

      switch (resolved) {
        case 'module:node': {
          logTrace(
            'Resolved "%s" via %s (%s | %s)',
            moduleUri,
            resolved,
            moduleRelativePath,
            fullPath
          )
          break
        }
        case 'path': {
          logDebug(
            'Resolved "%s" via %s (%s | %s)',
            moduleUri,
            resolved,
            moduleRelativePath,
            fullPath
          )
          break
        }
      }

      switch (origin) {
        case 'Module._load': {
          logDebug(
            'Loaded "%s" via %s resolved as (%s | %s)',
            moduleUri,
            origin,
            moduleRelativePath,
            fullPath
          )
          break
        }
        case 'packherd:export':
        case 'packherd:definition':
        case 'packherd:loading': {
          logTrace('Loaded "%s" via (%s | %s)', moduleUri, origin, resolved)
          break
        }
      }

      return exports
    } catch (err) {
      if (diagnostics && !moduleUri.endsWith('hook-require')) {
        logError(err)
        debugger
      }
    }
  }
}

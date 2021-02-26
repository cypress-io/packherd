import debug from 'debug'
import { Benchmark, setupBenchmark } from './benchmark'
import { ModuleLoaderOpts, PackherdModuleLoader } from './loader'
import type { PackherdTranspileOpts } from './types'

const logInfo = debug('packherd:info')
const logDebug = debug('packherd:debug')
const logTrace = debug('packherd:trace')

export * from './loader'
export type PackherdRequireOpts = ModuleLoaderOpts & {
  requireStatsFile?: string
  transpileOpts?: Partial<PackherdTranspileOpts>
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

  if (supportTS) {
    logInfo('Enabling TS support')
    logDebug({ supportTS, initTranspileCache, tsconfig })
    const { hookTranspileTs } = require('./transpile-ts')
    hookTranspileTs(
      Module,
      projectBaseDir,
      logInfo,
      initTranspileCache,
      tsconfig
    )
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

  // Depending from where the require hook is applied, the parent process may not contain a
  // cache and only use packherd to provide TypeScript transpile support.
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
    logTrace('_load "%s"', moduleUri)
    if (Module.builtinModules.includes(moduleUri)) {
      return origLoad(moduleUri, parent, isMain)
    }
    try {
      const {
        resolved,
        origin,
        exports,
        fullPath,
        relPath,
      } = moduleLoader.tryLoad(moduleUri, parent, isMain)

      switch (resolved) {
        case 'module:node': {
          logTrace(
            'Resolved "%s" via %s (%s | %s)',
            moduleUri,
            resolved,
            relPath,
            fullPath
          )
          break
        }
        case 'path': {
          logDebug(
            'Resolved "%s" via %s (%s | %s)',
            moduleUri,
            resolved,
            relPath,
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
            relPath,
            fullPath
          )
          break
        }
        case 'packherd:export':
        case 'packherd:definition':
        case 'packherd:loading': {
          logTrace('Loaded "%s" via %s', moduleUri, origin)
          break
        }
      }

      return exports
    } catch (err) {
      debugger
    }
  }
}

import { strict as assert } from 'assert'
import debug from 'debug'
import path from 'path'
import { Benchmark, setupBenchmark } from './benchmark'
import { ModuleLoaderOpts, PackherdModuleLoader } from './loader'

const logInfo = debug('packherd:info')
const logDebug = debug('packherd:debug')
const logTrace = debug('packherd:trace')

export * from './loader'
export type PackherdRequireOpts = ModuleLoaderOpts & {
  requireStatsFile?: string
  supportTS?: boolean
}

export function packherdRequire(entryFile: string, opts: PackherdRequireOpts) {
  const projectBaseDir = path.dirname(entryFile)
  assert(
    opts.moduleExports != null || opts.moduleDefinitions != null,
    'need to provide moduleDefinitions, moduleDefinitions or both'
  )

  const benchmark: Benchmark = setupBenchmark(
    projectBaseDir,
    opts.requireStatsFile
  )

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

  const Module = require('module')
  const origLoad = Module._load

  if (!!opts.supportTS) {
    logInfo('Enabling TS support')
    const { hookTranspileTs } = require('./transpile-ts')
    hookTranspileTs(Module, projectBaseDir, logInfo)
  }

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

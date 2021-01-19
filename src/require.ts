import debug from 'debug'
import path from 'path'
import { ModuleLoaderOpts, PackherdModuleLoader } from './loader'

const logInfo = debug('packherd:info')
const logDebug = debug('packherd:debug')
const logTrace = debug('packherd:trace')

export type PackherdRequireOpts = ModuleLoaderOpts

export function packherdRequire(
  packherdExports: NodeModule['exports'],
  entryFile: string,
  opts: PackherdRequireOpts
) {
  const projectBaseDir = path.dirname(entryFile)

  const packherdKeys = Object.keys(packherdExports)
  logInfo('packherd defining %d modules!', packherdKeys.length)
  logInfo({ projectBaseDir })

  const Module = require('module')
  const origLoad = Module._load

  const moduleLoader = new PackherdModuleLoader(
    packherdExports,
    Module,
    origLoad,
    projectBaseDir,
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
    debugger
    if (Module.builtinModules.includes(moduleUri)) {
      return origLoad(moduleUri, parent, isMain)
    }

    const {
      exports,
      origin,
      resolved,
      fullPath,
      relPath,
    } = moduleLoader.tryLoad(moduleUri, parent, isMain)

    switch (resolved) {
      case 'module': {
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
      case 'packherd': {
        logTrace('Loaded "%s" via %s', moduleUri, origin)
        break
      }
    }

    return exports
  }
}

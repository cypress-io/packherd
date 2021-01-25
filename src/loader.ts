import debug from 'debug'
import { strict as assert } from 'assert'
import Module from 'module'
import path from 'path'
import {
  ModuleBuildin,
  ModuleDefinition,
  ModuleLoadResult,
  ModuleResolveResult,
} from './types'

const logInfo = debug('packherd:info')
const logTrace = debug('packherd:trace')

export type GetModuleKey = (
  moduleRelativePath: string,
  moduleUri: string
) => string

export type ModuleLoaderOpts = {
  diagnostics?: boolean
  moduleExports: Record<string, Module>
  moduleDefinitions: Record<string, ModuleDefinition>
  getModuleKey?: GetModuleKey
}

const defaultGetModuleKey = (moduleRelativePath: string, _moduleUri: string) =>
  `./${moduleRelativePath}`

export class PackherdModuleLoader {
  exportHits: number = 0
  definitionHits: number = 0
  misses: number = 0
  private readonly diagnostics: boolean
  private readonly getModuleKey: GetModuleKey
  private readonly moduleExports: Record<string, Module>
  private readonly moduleDefinitions: Record<string, ModuleDefinition>

  constructor(
    private readonly Module: ModuleBuildin,
    private readonly origLoad: ModuleBuildin['_load'],
    private readonly projectBaseDir: string,
    opts: ModuleLoaderOpts
  ) {
    this.diagnostics = !!opts.diagnostics
    this.getModuleKey = opts.getModuleKey || defaultGetModuleKey
    assert(
      opts.moduleExports != null || opts.moduleDefinitions != null,
      'need to provide moduleDefinitions, moduleDefinitions or both'
    )
    this.moduleExports = opts.moduleExports ?? {}
    this.moduleDefinitions = opts.moduleDefinitions ?? {}
  }

  tryLoad(
    moduleUri: string,
    parent: NodeModule,
    isMain: boolean
  ): ModuleLoadResult {
    let { resolved, fullPath, relPath } = this._resolvePaths(
      moduleUri,
      parent,
      isMain
    )
    const moduleKey = this.getModuleKey(moduleUri, relPath)

    // 1. try to resolve from module exports
    const moduleExport: Module = this.moduleExports[moduleKey]

    let mod: Module | undefined
    let origin: ModuleLoadResult['origin'] | undefined
    if (moduleExport != null) {
      mod = this._createModule(fullPath, parent, moduleKey)
      debugger
      mod.exports = moduleExport.exports
      this.exportHits++
      origin = 'packherd:export'
    } else {
      // 2. try to resolve from module definitions
      const moduleDefinition = this.moduleDefinitions[moduleKey]
      if (moduleDefinition != null) {
        mod = this._createModule(fullPath, parent, moduleKey)
        moduleDefinition(
          mod.exports,
          mod,
          fullPath,
          path.dirname(fullPath),
          mod.require
        )
        this.definitionHits++
        origin = 'packherd:definition'
      }
    }
    if (mod != null) {
      assert(origin != null, 'should have set origin when setting module')

      this.Module._cache[fullPath] = mod
      this._dumpInfo()

      return {
        resolved,
        origin,
        exports: mod.exports,
        fullPath,
        relPath,
      }
    }

    // 3. If none of the above worked fall back to Node.js loader
    const exports = this.origLoad(moduleUri, parent, isMain)
    this.misses++
    this._dumpInfo()
    return { resolved, origin: 'Module._load', exports, fullPath, relPath }
  }

  private _dumpInfo() {
    if (this.diagnostics) {
      logInfo({
        exportHits: this.exportHits,
        definitionHits: this.definitionHits,
        misses: this.misses,
      })
    }
  }

  private _resolvePaths(
    moduleUri: string,
    parent: NodeModule,
    isMain: boolean
  ): ModuleResolveResult {
    let fullPath: string
    let resolved: ModuleResolveResult['resolved']
    try {
      fullPath = this.Module._resolveFilename(moduleUri, parent, isMain)
      resolved = 'module'
    } catch (err) {
      fullPath = path.resolve(this.projectBaseDir, moduleUri)
      resolved = 'path'
    }
    const relPath = path.relative(this.projectBaseDir, fullPath)
    return { resolved, fullPath, relPath }
  }

  private _createModule(
    fullPath: string,
    parent: Module,
    moduleKey: string
  ): NodeModule {
    const require = this.diagnostics
      ? this._interceptedRequire(fullPath, moduleKey)
      : this.Module.createRequire(fullPath)
    return {
      children: [],
      exports: {},
      filename: fullPath,
      id: fullPath,
      loaded: true,
      parent,
      path: fullPath,
      paths: parent?.paths || [],
      require,
    }
  }

  private _interceptedRequire(
    fullPath: string,
    moduleKey: string
  ): NodeRequire {
    const require = this.Module.createRequire(fullPath)
    const override = (id: string) => {
      logTrace('Module "%s" is requiring "%s"', moduleKey, id)
      return require(id)
    }
    override.main = require.main
    override.cache = require.cache
    // @ts-ignore deprecated
    override.extensions = require.extensions
    override.resolve = require.resolve.bind(require)
    return override
  }
}

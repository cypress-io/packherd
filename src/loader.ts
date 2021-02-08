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
import { Benchmark } from './benchmark'

const logDebug = debug('packherd:debug')
const logTrace = debug('packherd:trace')
const logSilly = debug('packherd:silly')
const logWarn = debug('packherd:warn')

export type GetModuleKey = (
  moduleRelativePath: string,
  moduleUri: string
) => string

export type ModuleLoaderOpts = {
  diagnostics?: boolean
  moduleExports?: Record<string, Module>
  moduleDefinitions?: Record<string, ModuleDefinition>
  getModuleKey?: GetModuleKey
}

const defaultGetModuleKey = (moduleRelativePath: string, _moduleUri: string) =>
  `./${moduleRelativePath}`

class LoadingModules {
  private readonly currentlyLoading: Map<string, Module> = new Map()
  start(id: string, mod: Module) {
    if (this.currentlyLoading.has(id)) {
      throw new Error(`Already loading ${id}`)
    }
    this.currentlyLoading.set(id, mod)
  }

  retrieve(id: string) {
    return this.currentlyLoading.get(id)
  }

  finish(id: string) {
    this.currentlyLoading.delete(id)
  }
}

export class PackherdModuleLoader {
  exportHits: number = 0
  definitionHits: number = 0
  misses: number = 0
  private readonly diagnostics: boolean
  private readonly getModuleKey: GetModuleKey
  private readonly moduleExports: Record<string, Module>
  private readonly moduleDefinitions: Record<string, ModuleDefinition>
  private readonly loading: LoadingModules

  constructor(
    private readonly Module: ModuleBuildin,
    private readonly origLoad: ModuleBuildin['_load'],
    private readonly projectBaseDir: string,
    private readonly benchmark: Benchmark,
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
    this.loading = new LoadingModules()
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
    const moduleCached = this.Module._cache[fullPath]
    if (moduleCached != null)
      return {
        resolved,
        origin: 'Module._cache',
        exports: moduleCached.exports,
        fullPath,
        relPath,
      }

    this.benchmark.time(fullPath)
    const moduleKey = this.getModuleKey(moduleUri, relPath)

    // 1. try to resolve from module exports
    const moduleExport: Module = this.moduleExports[moduleKey]

    let mod: Module | undefined
    let origin: ModuleLoadResult['origin'] | undefined
    if (moduleExport != null) {
      mod = this._createModule(fullPath, parent, moduleKey)
      mod.exports = moduleExport.exports
      this.exportHits++
      origin = 'packherd:export'
    } else {
      const loadingModule = this.loading.retrieve(moduleKey)
      if (loadingModule != null) {
        mod = loadingModule
        origin = 'packherd:loading'
      } else {
        // 2. try to resolve from module definitions
        const moduleDefinition = this.moduleDefinitions[moduleKey]
        if (moduleDefinition != null) {
          mod = this._createModule(fullPath, parent, moduleKey)
          this.loading.start(moduleKey, mod)
          try {
            moduleDefinition(
              mod.exports,
              mod,
              fullPath,
              path.dirname(fullPath),
              mod.require
            )
            this.definitionHits++
            origin = 'packherd:definition'
          } catch (err) {
            logWarn(err.message)
            logSilly(err)
            mod = undefined
          } finally {
            this.loading.finish(moduleKey)
          }
        }
      }
    }
    if (mod != null) {
      assert(origin != null, 'should have set origin when setting module')

      this.Module._cache[fullPath] = mod
      this._dumpInfo()
      this.benchmark.timeEnd(fullPath, origin)

      return {
        resolved,
        origin,
        exports: mod.exports,
        fullPath,
        relPath,
      }
    }

    // 3. If none of the above worked fall back to Node.js loader
    const exports = this.origLoad(fullPath, parent, isMain)
    this.misses++
    this._dumpInfo()
    this.benchmark.timeEnd(fullPath, 'Module._load')
    return { resolved, origin: 'Module._load', exports, fullPath, relPath }
  }

  private _dumpInfo() {
    if (this.diagnostics) {
      logDebug({
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

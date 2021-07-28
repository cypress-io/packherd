import debug from 'debug'
import { strict as assert } from 'assert'
import Module from 'module'
import path from 'path'
import {
  ModuleBuildin as ModuleBuiltin,
  ModuleDefinition,
  ModuleLoadResult,
  ModuleResolveResult,
  ModuleMapper,
} from './types'
import { Benchmark } from './benchmark'

const logDebug = debug('packherd:debug')
const logTrace = debug('packherd:trace')
const logSilly = debug('packherd:silly')
const logWarn = debug('packherd:warn')

export type GetModuleKey = (opts: {
  moduleUri: string
  moduleRelativePath: string
  parent?: NodeModule
}) => string

export type ModuleLoaderOpts = {
  diagnostics?: boolean
  moduleExports?: Record<string, Module>
  moduleDefinitions?: Record<string, ModuleDefinition>
  getModuleKey?: GetModuleKey
  moduleMapper?: ModuleMapper
}

const defaultGetModuleKey: GetModuleKey = ({ moduleRelativePath }) =>
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

  stack() {
    return Array.from(this.currentlyLoading.keys())
  }
}

function identity(
  _mod: NodeModule,
  moduleUri: string,
  _projectBasedir: string
) {
  return moduleUri
}

type CacheDirectResult = {
  moduleExports?: Object
  definition?: ModuleDefinition
  moduleKey: string
  fullPath: string
  moduleRelativePath: string
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
  private readonly moduleMapper: ModuleMapper

  constructor(
    private readonly Module: ModuleBuiltin,
    private readonly origLoad: ModuleBuiltin['_load'],
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
    this.moduleMapper = opts.moduleMapper ?? identity
    this.loading = new LoadingModules()
  }

  private _tryCacheDirect(
    moduleUri: string,
    parent?: NodeModule
  ): CacheDirectResult | undefined {
    const moduleRelativePath = path.relative(this.projectBaseDir, moduleUri)
    const key = this.getModuleKey({ moduleUri, moduleRelativePath, parent })

    // NOTE: that keys for node_modules are expected to be relative paths
    const fullPath = path.isAbsolute(moduleUri)
      ? moduleUri
      : path.resolve(this.projectBaseDir, key)

    const moduleExport = this.moduleExports[key]?.exports
    if (moduleExport != null)
      return {
        moduleExports: moduleExport,
        moduleKey: key,
        moduleRelativePath,
        fullPath,
      }

    const definition = this.moduleDefinitions[key]
    if (definition != null)
      return {
        definition,
        moduleKey: key,
        moduleRelativePath,
        fullPath,
      }

    return undefined
  }

  private _loadCacheDirect(
    moduleUri: string,
    parent?: NodeModule
  ): ModuleLoadResult | undefined {
    if (parent == null) return undefined

    const direct = this._tryCacheDirect(moduleUri, parent)
    if (direct?.moduleExports != null) {
      const { mod, origin } = this._initModuleFromExport(
        direct.moduleKey,
        direct.moduleExports,
        parent,
        direct.fullPath
      )
      return {
        resolved: 'cache:direct',
        origin,
        exports: mod.exports,
        fullPath: mod.path,
        moduleRelativePath: direct.moduleRelativePath,
      }
    }
    if (direct?.definition != null) {
      const { mod, origin } = this._initModuleFromDefinition(
        direct.moduleKey,
        direct.definition,
        parent,
        direct.fullPath
      )
      if (mod != null) {
        return {
          resolved: 'cache:direct',
          origin,
          exports: mod.exports,
          fullPath: mod.path,
          moduleRelativePath: direct.moduleRelativePath,
        }
      }
    }
    return undefined
  }

  tryLoad(
    moduleUri: string,
    parent: NodeModule,
    isMain: boolean
  ): ModuleLoadResult {
    let directResult = this._loadCacheDirect(moduleUri, parent)
    if (directResult != null) {
      this._dumpInfo()
      return directResult
    }

    let { resolved, fullPath, moduleRelativePath } = this._resolvePaths(
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
        moduleRelativePath,
      }

    this.benchmark.time(fullPath)
    const moduleKey = this.getModuleKey({
      moduleUri,
      moduleRelativePath,
      parent,
    })

    let mod: Module | undefined
    let origin: ModuleLoadResult['origin'] | undefined

    // 1. try to resolve from module exports
    const moduleExport: Module = this.moduleExports[moduleKey]

    if (moduleExport != null) {
      ;({ mod, origin } = this._initModuleFromExport(
        moduleKey,
        moduleExport.exports,
        parent,
        fullPath
      ))
    } else {
      const loadingModule = this.loading.retrieve(moduleKey)
      if (loadingModule != null) {
        mod = loadingModule
        origin = 'packherd:loading'
      } else {
        // 2. try to resolve from module definitions
        const moduleDefinition = this.moduleDefinitions[moduleKey]
        if (moduleDefinition != null) {
          ;({ mod, origin } = this._initModuleFromDefinition(
            moduleKey,
            moduleDefinition,
            parent,
            fullPath
          ))
        }
      }
    }

    if (mod != null) {
      assert(origin != null, 'should have set origin when setting module')

      this.Module._cache[fullPath] = mod
      this.benchmark.timeEnd(fullPath, origin, this.loading.stack())

      this._dumpInfo()
      return {
        resolved,
        origin,
        exports: mod.exports,
        fullPath,
        moduleRelativePath,
      }
    }

    // 3. If none of the above worked fall back to Node.js
    const exports = this.origLoad(fullPath, parent, isMain)
    this.misses++
    this._dumpInfo()
    this.benchmark.timeEnd(fullPath, 'Module._load', this.loading.stack())
    return {
      resolved,
      origin: 'Module._load',
      exports,
      fullPath,
      moduleRelativePath,
    }
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
    let fullPath: string | undefined
    let resolved: ModuleResolveResult['resolved']

    moduleUri = this.moduleMapper(parent, moduleUri, this.projectBaseDir)
    resolved = 'module:node'
    fullPath = this._tryResolveFilename(moduleUri, parent, isMain)
    assert(fullPath != null, `packherd: unresolvable module ${moduleUri}`)

    const relPath = path.relative(this.projectBaseDir, fullPath)
    return { resolved, fullPath, moduleRelativePath: relPath }
  }

  private _tryResolveFilename(
    moduleUri: string | undefined,
    parent: NodeModule,
    isMain: boolean
  ) {
    if (moduleUri == null) return undefined
    try {
      return this.Module._resolveFilename(moduleUri, parent, isMain)
    } catch (err) {
      return undefined
    }
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
      // TODO(thlorenz): not entirely correct if parent is nested deeper or higher
      paths: parent?.paths || [],
      require,
    }
  }

  private _initModuleFromExport(
    moduleKey: string,
    moduleExports: Module['exports'],
    parent: NodeModule,
    fullPath: string
  ) {
    const mod = this._createModule(fullPath, parent, moduleKey)
    mod.exports = moduleExports
    const origin: ModuleLoadResult['origin'] = 'packherd:export'
    this.exportHits++
    return { mod, origin }
  }

  private _initModuleFromDefinition(
    moduleKey: string,
    moduleDefinition: ModuleDefinition,
    parent: NodeModule,
    fullPath: string
  ) {
    const origin: ModuleLoadResult['origin'] = 'packherd:definition'
    const mod: NodeModule = this._createModule(fullPath, parent, moduleKey)
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
      return { mod, origin }
    } catch (err) {
      logWarn(err.message)
      logSilly(err)
      return { mod: undefined, origin }
    } finally {
      this.loading.finish(moduleKey)
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

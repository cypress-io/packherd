import debug from 'debug'
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
import { strict as assert } from 'assert'

const logDebug = debug('packherd:debug')
const logTrace = debug('packherd:trace')
const logSilly = debug('packherd:silly')
const logWarn = debug('packherd:warn')

export type GetModuleKey = (opts: {
  moduleUri: string
  baseDir: string
  parent?: NodeModule
}) => { moduleKey: string | undefined; moduleRelativePath: string | undefined }

export type ModuleLoaderOpts = {
  diagnostics?: boolean
  moduleExports?: Record<string, Module>
  moduleDefinitions?: Record<string, ModuleDefinition>
  getModuleKey?: GetModuleKey
  moduleMapper?: ModuleMapper
}

const defaultGetModuleKey: GetModuleKey = ({ moduleUri, baseDir }) => {
  const moduleRelativePath = path.relative(baseDir, moduleUri)
  return { moduleKey: `./${moduleRelativePath}`, moduleRelativePath }
}

class LoadingModules {
  private readonly currentlyLoading: Map<string, Module> = new Map()
  start(id: string, mod: Module) {
    if (this.currentlyLoading.has(id)) {
      throw new Error(`Already loading ${id}\nstack: ${this.stack()}`)
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

  // -----------------
  // Cache Direct
  // -----------------
  private _tryCacheDirect(moduleKey?: string): CacheDirectResult {
    if (moduleKey == null) return {}

    const moduleExport = this.moduleExports[moduleKey]?.exports
    if (moduleExport != null)
      return {
        moduleExports: moduleExport,
      }

    const definition = this.moduleDefinitions[moduleKey]
    return {
      definition,
    }
  }

  private _loadCacheDirect(
    moduleUri: string,
    moduleKey?: string,
    fullPath?: string,
    parent?: NodeModule
  ): (ModuleLoadResult & { mod: NodeModule }) | undefined {
    if (parent == null || moduleKey == null) {
      return undefined
    }
    assert(
      fullPath != null,
      'fullPath should be set when moduleKey was provided'
    )

    const direct = this._tryCacheDirect(moduleKey)

    if (direct?.moduleExports != null) {
      const { mod, origin } = this._initModuleFromExport(
        moduleKey,
        direct.moduleExports,
        parent,
        fullPath
      )
      return {
        resolved: 'cache:direct',
        origin,
        exports: mod.exports,
        mod,
        fullPath: mod.path,
      }
    }
    if (direct?.definition != null) {
      const { mod, origin } = this._initModuleFromDefinition(
        moduleKey,
        moduleUri,
        direct.definition,
        parent,
        fullPath
      )
      if (mod != null) {
        return {
          resolved: 'cache:direct',
          origin,
          exports: mod.exports,
          mod,
          fullPath: mod.path,
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
    // 1. Try to find moduleUri directly in Node.js module cache
    if (path.isAbsolute(moduleUri)) {
      const moduleCached: NodeModule = this.Module._cache[moduleUri]
      if (moduleCached != null) {
        const fullPath = moduleUri
        const resolved = 'module-uri:node'
        return {
          resolved,
          origin: 'Module._cache',
          exports: moduleCached.exports,
          fullPath,
        }
      }
    }

    // 2. Try to obtain a module key, this could be from a map or the relative path
    let { moduleKey, moduleRelativePath } = this.getModuleKey({
      moduleUri,
      baseDir: this.projectBaseDir,
      parent,
    })

    // 3. Try to see if the moduleKey was correct and can be loaded from the Node.js cache
    if (moduleKey != null && path.isAbsolute(moduleKey)) {
      const moduleCached = this.Module._cache[moduleKey]
      if (moduleCached != null) {
        const fullPath = moduleKey
        const resolved = 'module-key:node'
        const origin = 'Module._cache'
        this._updateCaches(moduleCached, resolved, origin, moduleKey)
        return {
          resolved,
          origin,
          exports: moduleCached.exports,
          fullPath,
        }
      }
    }

    // 4. Try to obtain a full path
    let fullPath = this._tryResolveFullPath(
      moduleUri,
      moduleRelativePath,
      parent
    )

    // 5. Try again in the Node.js module cache
    if (fullPath != null && fullPath !== moduleUri) {
      const moduleCached = this.Module._cache[fullPath]
      if (moduleCached != null) {
        const resolved = 'module-fullpath:node'
        const origin = 'Module._cache'
        this._updateCaches(moduleCached, resolved, origin, moduleKey)
        return {
          resolved,
          origin,
          exports: moduleCached.exports,
          fullPath,
        }
      }
    }

    // 6. Try to locate this module inside the cache, either export or definition
    let loadedModule = this._loadCacheDirect(
      moduleUri,
      moduleKey,
      fullPath,
      parent
    )
    if (loadedModule != null) {
      this._dumpInfo()
      this._updateCaches(
        loadedModule.mod,
        loadedModule.resolved,
        loadedModule.origin,
        moduleKey
      )
      return loadedModule
    }

    // 7. Lastly try to resolve the module via Node.js resolution which requires expensive I/O and may fail
    //    in which case it throws an error
    this.benchmark.time(moduleUri)

    let resolved: ModuleResolveResult['resolved']
    const directFullPath = fullPath
    ;({ resolved, fullPath } = this._resolvePaths(
      moduleUri,
      parent,
      isMain,
      directFullPath
    ))

    const exports = this.origLoad(fullPath, parent, isMain)
    this.misses++
    this._dumpInfo()
    this.benchmark.timeEnd(moduleUri, 'Module._load', this.loading.stack())
    return {
      resolved,
      origin: 'Module._load',
      exports,
      fullPath,
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

  private _updateCaches(
    mod: NodeModule,
    resolved: string,
    origin: string,
    moduleKey: string | undefined
  ) {
    assert(
      mod.id != null,
      `Should have module id when loading by ${resolved} via ${origin} succeeded`
    )
    this.Module._cache[mod.id] = mod
    if (moduleKey != null) {
      this.moduleExports[moduleKey] = mod
    }
  }
  private _resolvePaths(
    moduleUri: string,
    parent: NodeModule,
    isMain: boolean,
    directFullPath?: string
  ): ModuleResolveResult {
    const mappedModuleUri = this.moduleMapper(
      parent,
      moduleUri,
      this.projectBaseDir
    )
    const resolved = 'module:node'
    const fullPath = this._tryResolveFilename(
      mappedModuleUri,
      directFullPath,
      parent,
      isMain
    )
    assert(fullPath != null, `packherd: unresolvable module ${moduleUri}`)
    return { resolved, fullPath }
  }

  // -----------------
  // Module Initialization
  // -----------------
  private _createModule(
    fullPath: string,
    parent: Module,
    moduleUri: string
  ): NodeModule {
    const require = this.diagnostics
      ? this._interceptedRequire(fullPath, moduleUri)
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
    moduleUri: string,
    moduleExports: Module['exports'],
    parent: NodeModule,
    fullPath: string
  ) {
    const mod = this._createModule(fullPath, parent, moduleUri)
    mod.exports = moduleExports
    const origin: ModuleLoadResult['origin'] = 'packherd:export'
    this.exportHits++
    return { mod, origin }
  }

  private _initModuleFromDefinition(
    moduleKey: string,
    moduleUri: string,
    moduleDefinition: ModuleDefinition,
    parent: NodeModule,
    fullPath: string
  ) {
    const origin: ModuleLoadResult['origin'] = 'packherd:definition'
    const mod: NodeModule = this._createModule(fullPath, parent, moduleUri)

    try {
      this.loading.start(moduleKey, mod)
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
    moduleUri: string
  ): NodeRequire {
    const require = this.Module.createRequire(fullPath)
    const override = (id: string) => {
      logTrace('Module "%s" is requiring "%s"', moduleUri, id)
      return require(id)
    }
    override.main = require.main
    override.cache = require.cache
    // @ts-ignore deprecated
    override.extensions = require.extensions
    override.resolve = require.resolve.bind(require)
    return override
  }

  // -----------------
  // Helpers
  // -----------------
  private _tryResolveFilename(
    moduleUri: string | undefined,
    fullPath: string | undefined,
    parent: NodeModule,
    isMain: boolean
  ) {
    if (moduleUri == null) return undefined
    try {
      return this.Module._resolveFilename(moduleUri, parent, isMain)
    } catch (err) {
      if (fullPath != null) {
        try {
          // Resolving moduleUri directly didn't work, let's try again with the full path our algorithm figured out
          const res = this.Module._resolveFilename(fullPath, parent, isMain)
          return res
        } catch (err2) {
          console.error(err2)
          return undefined
        }
      }
    }
  }

  private _tryResolveFullPath(
    moduleUri: string,
    moduleRelativePath?: string,
    parent?: NodeModule
  ): string | undefined {
    if (path.isAbsolute(moduleUri)) return moduleUri

    if (moduleRelativePath != null) {
      return path.resolve(this.projectBaseDir, moduleRelativePath)
    }
    if (parent != null && moduleUri.startsWith('.')) {
      return path.resolve(parent.path, moduleUri)
    }
  }
}

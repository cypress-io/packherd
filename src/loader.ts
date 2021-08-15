import debug from 'debug'
import Module from 'module'
import path from 'path'
import {
  ModuleBuildin as ModuleBuiltin,
  ModuleDefinition,
  ModuleLoadResult,
  ModuleResolveResult,
  ModuleMapper,
  ModuleNeedsReload,
} from './types'
import { Benchmark } from './benchmark'
import { strict as assert } from 'assert'

const logDebug = debug('packherd:debug')
const logTrace = debug('packherd:trace')
const logSilly = debug('packherd:silly')
const logWarn = debug('packherd:warn')

export type GetModuleKeyOpts = {
  filename: string
  path: string
  relFilename?: string
  relPath?: string
  fromSnapshot?: boolean
  isResolve?: boolean
}

export type GetModuleKey = (opts: {
  moduleUri: string
  baseDir: string
  opts?: GetModuleKeyOpts
}) => { moduleKey: string | undefined; moduleRelativePath: string | undefined }

export type ModuleLoaderOpts = {
  diagnostics?: boolean
  moduleExports?: Record<string, Module>
  moduleDefinitions?: Record<string, ModuleDefinition>
  getModuleKey?: GetModuleKey
  moduleNeedsReload?: ModuleNeedsReload
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

function defaultModuleNeedsReload(
  moduleId: string,
  loadedModules: Set<string>,
  moduleCache: Record<string, NodeModule>
) {
  return loadedModules.has(moduleId) && moduleCache == null
}

class CacheTracker {
  private readonly _loadedModules: Set<string> = new Set()
  constructor(
    private readonly _moduleCache: Record<string, NodeModule>,
    private readonly _moduleExports: Record<string, Module>,
    private readonly _moduleNeedsReload: ModuleNeedsReload
  ) {}

  addLoadedById(id: string) {
    this._loadedModules.add(id)
  }

  addLoaded(
    mod: NodeModule,
    resolved: string,
    origin: string,
    moduleKey?: string
  ) {
    assert(
      mod.id != null,
      `Should have module id when loading by ${resolved} via ${origin} succeeded`
    )
    this._moduleCache[mod.id] = mod
    if (moduleKey != null) {
      this._moduleExports[moduleKey] = mod
    }
    this._loadedModules.add(mod.id)

    if (logTrace.enabled) {
      logTrace(
        'Loaded "%s" (%s | %s) -> moduleCache: %d, exportsCache: %d, loaded: %d',
        mod.id,
        resolved,
        origin,
        Object.keys(this._moduleCache).length,
        Object.keys(this._moduleExports).length,
        this._loadedModules.size
      )
    }
  }

  moduleNeedsReload(mod: NodeModule) {
    // We update our exports cache when loading a module, thus if it came from there
    // and doesn't have one yet that means that it was never loaded before
    if (mod.id == null) return false
    return this._moduleNeedsReload(
      mod.id,
      this._loadedModules,
      this._moduleCache
    )
  }
}

function identity(
  _mod: NodeModule,
  moduleUri: string,
  _projectBasedir: string
) {
  return moduleUri
}

function needsFullPathResolve(p: string) {
  return !path.isAbsolute(p) && p.startsWith('./')
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
  private readonly cacheTracker: CacheTracker

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
    this.cacheTracker = new CacheTracker(
      this.Module._cache,
      this.moduleExports,
      opts.moduleNeedsReload ?? defaultModuleNeedsReload
    )
  }

  // -----------------
  // Loading within Exports Cache
  // -----------------
  shouldBypassCache(mod: NodeModule) {
    this._ensureFullPathExportsModule(mod)
    return this.cacheTracker.moduleNeedsReload(mod)
  }

  registerModuleLoad(mod: NodeModule) {
    this._ensureFullPathExportsModule(mod)
    this.cacheTracker.addLoaded(mod, 'cache', 'exports')
    this.exportHits++
    this._dumpInfo()
  }

  // -----------------
  // Cache Direct
  // -----------------
  private _tryCacheDirect(
    fullPath: string,
    moduleKey?: string
  ): CacheDirectResult {
    if (moduleKey == null) return {}

    const mod = this.moduleExports[moduleKey]

    if (mod != null) {
      mod.filename = fullPath
      mod.id = fullPath
      mod.path = path.dirname(fullPath)

      if (mod.parent != null) {
        this._ensureFullPathExportsModule(mod.parent)
      }
      if (!this.cacheTracker.moduleNeedsReload(mod)) {
        const moduleExport = mod.exports
        return {
          moduleExports: moduleExport,
        }
      }
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

    const direct = this._tryCacheDirect(fullPath, moduleKey)

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

  tryResolve(moduleUri: string, opts?: GetModuleKeyOpts): ModuleResolveResult {
    // 1. If is full path we are done
    if (path.isAbsolute(moduleUri)) {
      return { fullPath: moduleUri, resolved: 'path' }
    }

    // 2. Resolve via module key
    let { moduleKey, moduleRelativePath } = this.getModuleKey({
      moduleUri,
      baseDir: this.projectBaseDir,
      opts,
    })

    if (moduleKey != null && path.isAbsolute(moduleKey)) {
      return { fullPath: moduleKey, resolved: 'module-key:node' }
    }

    // 3. Try to obtain a full path via the resolved relative path
    let fullPath = this._tryResolveFullPath(moduleUri, moduleRelativePath, opts)

    if (fullPath != null) {
      return { fullPath, resolved: 'module-fullpath:node' }
    }

    // 4. Lastly try to resolve the module via Node.js resolution
    assert(
      opts != null && (opts as NodeModule).id != null,
      'Need a parent to resolve via Node.js'
    )
    const directFullPath = fullPath
    let resolved: ModuleResolveResult['resolved']
    ;({ resolved, fullPath } = this._resolvePaths(
      moduleUri,
      opts as NodeModule,
      false,
      directFullPath
    ))
    return { fullPath, resolved }
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
      opts: parent,
    })

    // 3. Try to see if the moduleKey was correct and can be loaded from the Node.js cache
    if (moduleKey != null && path.isAbsolute(moduleKey)) {
      const moduleCached = this.Module._cache[moduleKey]
      if (moduleCached != null) {
        const fullPath = moduleKey
        const resolved = 'module-key:node'
        const origin = 'Module._cache'
        this.cacheTracker.addLoaded(moduleCached, resolved, origin, moduleKey)
        return {
          resolved,
          origin,
          exports: moduleCached.exports,
          fullPath,
        }
      }
    }

    // 4. Try to obtain a full path
    this._ensureParentPaths(parent)
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
        this.cacheTracker.addLoaded(moduleCached, resolved, origin, moduleKey)
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

      this.cacheTracker.addLoaded(
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

    const directFullPath = fullPath
    let resolved: ModuleResolveResult['resolved']
    ;({ resolved, fullPath } = this._resolvePaths(
      moduleUri,
      parent,
      isMain,
      directFullPath
    ))

    // 8. Something like './foo' might now have been resolved to './foo.js' and
    // thus we may find it inside our cache that way
    const derivedModuleKey = `./${path.relative(this.projectBaseDir, fullPath)}`
    loadedModule = this._loadCacheDirect(
      moduleUri,
      derivedModuleKey,
      fullPath,
      parent
    )
    if (loadedModule != null) {
      this._dumpInfo()
      loadedModule.resolved = 'cache:node'
      this.cacheTracker.addLoaded(
        loadedModule.mod,
        loadedModule.resolved,
        loadedModule.origin,
        moduleKey
      )
      return loadedModule
    }

    const exports = this.origLoad(fullPath, parent, isMain)
    // Node.js load only returns the `exports` object thus we need to get the
    // module itself from the cache to which it was added during load
    const nodeModule = this.Module._cache[fullPath]

    this.misses++
    this._dumpInfo()
    this.benchmark.timeEnd(moduleUri, 'Module._load', this.loading.stack())

    const origin = 'Module._load'
    if (nodeModule != null) {
      this.cacheTracker.addLoaded(nodeModule, resolved, origin, moduleKey)
    } else {
      this.cacheTracker.addLoadedById(fullPath)
    }
    return {
      resolved,
      origin,
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

  private _resolvePaths(
    moduleUri: string,
    parent: NodeModule,
    isMain: boolean,
    directFullPath?: string
  ): ModuleResolveResult {
    if (1 + 1 !== 2) {
      const mappedModuleUri = this.moduleMapper(
        parent,
        moduleUri,
        this.projectBaseDir
      )
      console.log(mappedModuleUri)
    }
    const resolved = 'module:node'
    const fullPath = this._tryResolveFilename(
      moduleUri,
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
    parent: Module | undefined,
    moduleUri: string
  ): NodeModule {
    const require = this.diagnostics
      ? this._interceptedRequire(fullPath, moduleUri, parent)
      : this._createRequire(fullPath, moduleUri, parent)
    return {
      children: [],
      exports: {},
      filename: fullPath,
      id: fullPath,
      loaded: false,
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
    mod.loaded = true
    const origin: ModuleLoadResult['origin'] = 'packherd:export'
    this.exportHits++
    return { mod, origin }
  }

  private _initModuleFromDefinition(
    moduleUri: string,
    moduleDefinition: ModuleDefinition,
    parent: NodeModule,
    fullPath: string
  ) {
    const origin: ModuleLoadResult['origin'] = 'packherd:definition'

    const loading = this.loading.retrieve(fullPath)
    if (loading != null) return { mod: loading, origin }

    const mod: NodeModule = this._createModule(fullPath, parent, moduleUri)

    try {
      this.loading.start(fullPath, mod)
      moduleDefinition(
        mod.exports,
        mod,
        fullPath,
        path.dirname(fullPath),
        mod.require
      )
      mod.loaded = true
      this.definitionHits++
      return { mod, origin }
    } catch (err) {
      logWarn(err.message)
      logSilly(err)
      return { mod: undefined, origin }
    } finally {
      this.loading.finish(fullPath)
    }
  }

  private _createRequire(
    fullPath: string,
    moduleUri: string,
    parent?: NodeModule
  ) {
    const require = this.Module.createRequire(fullPath)
    if (parent == null) {
      parent = this._createModule(fullPath, parent, moduleUri)
    }

    require.resolve = Object.assign(
      (moduleUri: string, _options?: { paths?: string[] }) => {
        return this.tryResolve(moduleUri, parent).fullPath
      },
      {
        paths(request: string) {
          if (Module.builtinModules.includes(request)) return null
          return parent?.paths || null
        },
      }
    )

    return require
  }
  private _interceptedRequire(
    fullPath: string,
    moduleUri: string,
    parent?: NodeModule
  ): NodeRequire {
    const require = this._createRequire(fullPath, moduleUri, parent)
    const override = function (this: NodeModule, id: string) {
      logTrace('Module "%s" is requiring "%s"', moduleUri, id)
      return require.call(this, id)
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
    opts?: GetModuleKeyOpts
  ): string | undefined {
    if (path.isAbsolute(moduleUri)) return moduleUri

    if (moduleRelativePath != null) {
      return path.resolve(this.projectBaseDir, moduleRelativePath)
    }
    if (opts != null && moduleUri.startsWith('.')) {
      return path.resolve(opts.path, moduleUri)
    }
  }

  private _ensureFullPathExportsModule(mod: NodeModule) {
    if (mod.id == null) mod.id = mod.filename
    if (needsFullPathResolve(mod.id)) {
      mod.id = path.resolve(this.projectBaseDir, mod.id)
    }
    if (needsFullPathResolve(mod.filename)) {
      mod.filename = path.resolve(this.projectBaseDir, mod.filename)
    }
    if (needsFullPathResolve(mod.path)) {
      mod.path = path.resolve(this.projectBaseDir, mod.path)
    }
  }

  private _ensureParentPaths(parent: NodeModule) {
    if (
      parent.paths == null ||
      (parent.paths.length === 0 && parent.path != null)
    ) {
      let dir = path.resolve(this.projectBaseDir, parent.path)
      parent.paths = []
      while (dir.length > this.projectBaseDir.length) {
        parent.paths.push(path.join(dir, 'node_modules'))
        dir = path.dirname(dir)
      }
      parent.paths.push(path.join(dir, 'node_modules'))
    }
  }
}

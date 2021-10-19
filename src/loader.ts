import debug from 'debug'
import Module from 'module'
import path from 'path'
import {
  ModuleBuiltin as ModuleBuiltin,
  ModuleDefinition,
  ModuleLoadResult,
  ModuleResolveResult,
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

/**
 * Function to override how a module key/id is derived from a moduleUri.
 * In order to load the module from either the `ModuleLoaderOpts['moduleExports']` or
 * `ModuleLoaderOpts['moduleDefinitions']` the returned key needs to match how modules are keyed there.
 *
 * @param moduleUri uri specified via a `require` or `import`
 * @param baseDir the base dir of the project
 * @param opts
 *
 * @category Loader
 */
export type GetModuleKey = (opts: {
  moduleUri: string
  baseDir: string
  opts?: GetModuleKeyOpts
}) => { moduleKey: string | undefined; moduleRelativePath: string | undefined }

/**
 * Configures the {@link PackherdModuleLoader}.
 *
 * @property diagnostics: if set loading diagnostics are collected and logged
 * @property moduleExports: map holding fully initialized and exported modules
 * @property moduleDefinitions: map holding functions that when invoke initialize a module and return its exports
 * @property getModuleKey: overrides how a module's key is resolved from its uri
 * @property moduleNeedsReload?: determines if a module needs to be reloaded even if it was found in a cache or
 * `moduleExports`
 *
 * @category Loader
 */
export type ModuleLoaderOpts = {
  diagnostics?: boolean
  moduleExports?: Record<string, Module>
  moduleDefinitions?: Record<string, ModuleDefinition>
  getModuleKey?: GetModuleKey
  moduleNeedsReload?: ModuleNeedsReload
}

// Very simple implementation of obtaining a module key by just prefixing the relative path with `./`
const defaultGetModuleKey: GetModuleKey = ({ moduleUri, baseDir }) => {
  const moduleRelativePath = path.relative(baseDir, moduleUri)
  return { moduleKey: `./${moduleRelativePath}`, moduleRelativePath }
}

/**
 * This keeps track of which modules are being loaded currently and is used to handle circular imports properly.
 *
 * @category Loader
 */
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

/**
 * Tracks loaded modules and is used to determine if a module needs to be reloaded or if it could be retrieved from a
 * cache.
 * Basically we register all loaded modules here and when loading a module we compare our record with the
 * {@see * _moduleCache}. If we have it, but the `_moduleCache` doesn't this means that it was deleted from the latter.
 * In that case we need to reload it fresh instead of pulling from any cache, including our {@link _moduleExports} in
 * order to replicate the behaviour that Node.js has by default.
 *
 * @category Loader
 */
class CacheTracker {
  private readonly _loadedModules: Set<string> = new Set()

  /**
   * Creates {@link CacheTracker} instance.
   *
   * @param _moduleCache the Node.js module cache, aka `Module._cache` and `require.cache` which are the same object
   * @param _moduleExports the module exports provided to packherd, i.e. could be pre-initialized modules snapshotted
   * into the app. Any loaded module not yet found inside this map is added there. However it is **NOT** part of the
   * decision if a module should be reloaded or not.
   * @param _moduleNeedsReload the function to determine if a module needs to be reloaded even if it was found inside
   * the {@link _moduleCache} or {@link _moduleExports}.
   */
  constructor(
    private readonly _moduleCache: Record<string, NodeModule>,
    private readonly _moduleExports: Record<string, Module>,
    private readonly _moduleNeedsReload: ModuleNeedsReload
  ) {}

  /**
   * Registers a module load for the given id.
   */
  addLoadedById(id: string) {
    this._loadedModules.add(id)
  }

  /**
   * Registers a module as loaded providing added information about how it was loaded.
   *
   * @param mod the module that was loaded
   * @param resolved the strategy as to how the module was resolved
   * @param origin the origin of the module, i.e. did it come from a cache, _moduleExports or similar
   * @param moduleKey the derived key of the module if it was obtained
   */
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
    // Add the module to the Node.js module cache
    this._moduleCache[mod.id] = mod

    // Add it to the `_moduleExports` as well in order to shortcut loading it from inside the snapshot
    if (moduleKey != null) {
      this._moduleExports[moduleKey] = mod
    }

    // Register the module as loaded
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

  /**
   * Determines if a module needs to be loaded fresh or if it can either be loaded from the {@link _moduleCache} or
   * {@link _moduleExports}.
   */
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

function needsFullPathResolve(p: string) {
  return !path.isAbsolute(p) && p.startsWith('./')
}

type CacheDirectResult = {
  moduleExports?: Object
  definition?: ModuleDefinition
}

export class PackherdModuleLoader {
  exportHits: Set<string> = new Set()
  definitionHits: Set<string> = new Set()
  misses: Set<string> = new Set()
  private readonly diagnostics: boolean
  private _dumpedInfo: {
    exportHits: number
    definitionHits: number
    misses: number
  }
  private readonly getModuleKey: GetModuleKey
  private readonly moduleExports: Record<string, Module>
  private readonly moduleDefinitions: Record<string, ModuleDefinition>
  private readonly loading: LoadingModules
  private readonly cacheTracker: CacheTracker

  constructor(
    private readonly Module: ModuleBuiltin,
    private readonly origLoad: ModuleBuiltin['_load'],
    private readonly projectBaseDir: string,
    private readonly benchmark: Benchmark,
    opts: ModuleLoaderOpts
  ) {
    this.diagnostics = !!opts.diagnostics
    this._dumpedInfo = { exportHits: 0, definitionHits: 0, misses: 0 }
    this.getModuleKey = opts.getModuleKey || defaultGetModuleKey
    assert(
      opts.moduleExports != null || opts.moduleDefinitions != null,
      'need to provide moduleDefinitions, moduleDefinitions or both'
    )
    this.moduleExports = opts.moduleExports ?? {}
    this.moduleDefinitions = opts.moduleDefinitions ?? {}
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

  registerModuleLoad(
    mod: NodeModule,
    loadedFrom:
      | 'exports'
      | 'definitions'
      | 'Node.js require'
      | 'Counted already'
  ) {
    this._ensureFullPathExportsModule(mod)
    this.cacheTracker.addLoaded(mod, 'cache', loadedFrom)
    switch (loadedFrom) {
      case 'exports':
        this.exportHits.add(mod.id)
        break
      case 'definitions':
        this.definitionHits.add(mod.id)
        break
      case 'Node.js require':
        this.misses.add(mod.id)
        break
      default:
        // not counting loads from Node.js cache or the ones already counted via tryLoad
        break
    }
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
    // 1. Resolve via module key
    let { moduleKey, moduleRelativePath } = this.getModuleKey({
      moduleUri,
      baseDir: this.projectBaseDir,
      opts,
    })

    if (moduleKey != null && path.isAbsolute(moduleKey)) {
      return { fullPath: moduleKey, resolved: 'module-key:node' }
    }

    // 2. Try to obtain a full path via the resolved relative path
    let fullPath = this._tryResolveFullPath(moduleUri, moduleRelativePath, opts)

    if (fullPath != null) {
      return { fullPath, resolved: 'module-fullpath:node' }
    }

    // 3. Lastly try to resolve the module via Node.js resolution
    if (opts != null) {
      this._ensureParentPaths(opts)
    }
    if (
      !path.isAbsolute(moduleUri) &&
      (opts == null || (opts as NodeModule).id == null)
    ) {
      const msg =
        `Cannot resolve module '${moduleUri}'.` +
        `Need a parent to resolve via Node.js when relative path is provided.`
      throw moduleNotFoundError(msg, moduleUri)
    }

    const directFullPath = fullPath
    let resolved: ModuleResolveResult['resolved']
    ;({ resolved, fullPath } = this._resolvePaths(
      moduleUri,
      opts as NodeModule | undefined,
      false,
      directFullPath
    ))
    return { fullPath, resolved }
  }

  tryLoad(
    moduleUri: string,
    parent: NodeModule | undefined,
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

    let moduleKey: string | undefined
    let moduleRelativePath: string | undefined
    // 2. Try to obtain a module key, this could be from a map or the relative path
    if (parent != null) {
      ;({ moduleKey, moduleRelativePath } = this.getModuleKey({
        moduleUri,
        baseDir: this.projectBaseDir,
        opts: parent,
      }))
    }

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

    let fullPath: string | undefined
    if (parent != null) {
      // 4. Try to obtain a full path
      this._ensureParentPaths(parent)
      fullPath =
        this._tryResolveFullPath(moduleUri, moduleRelativePath, parent) ??
        moduleUri

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
    }

    // 7. Lastly try to resolve the module via Node.js resolution which requires expensive I/O and may fail
    //    in which case it throws an error
    this.benchmark.time(moduleUri)

    const directFullPath = fullPath ?? moduleUri
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
    const loadedModule = this._loadCacheDirect(
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

    this._dumpInfo()
    this.benchmark.timeEnd(moduleUri, 'Module._load', this.loading.stack())

    const origin = 'Module._load'
    if (nodeModule != null) {
      this.misses.add(nodeModule.id)
      this.cacheTracker.addLoaded(nodeModule, resolved, origin, moduleKey)
    } else {
      this.misses.add(fullPath)
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
    if (this.diagnostics && logDebug.enabled) {
      const {
        exportHits: prevExportHits,
        definitionHits: prevDefinitionHits,
        misses: prevMisses,
      } = this._dumpedInfo

      const exportHits = this.exportHits.size
      const definitionHits = this.definitionHits.size
      const misses = this.misses.size
      if (
        prevExportHits !== exportHits ||
        prevDefinitionHits !== definitionHits ||
        prevMisses !== misses
      ) {
        this._dumpedInfo = {
          exportHits,
          definitionHits,
          misses,
        }
        logDebug(this._dumpedInfo)
      }
    }
  }

  private _resolvePaths(
    moduleUri: string,
    parent: NodeModule | undefined,
    isMain: boolean,
    directFullPath?: string
  ): ModuleResolveResult {
    const resolved = 'module:node'
    const fullPath = this._tryResolveFilename(
      moduleUri,
      directFullPath,
      parent,
      isMain
    )
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
      paths: parent?.paths ?? [],
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
    this.exportHits.add(mod.id)
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
      this.definitionHits.add(mod.id)
      return { mod, origin }
    } catch (err: any) {
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
          return parent?.paths ?? null
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
    moduleUri: string,
    fullPath: string | undefined,
    parent: NodeModule | undefined,
    isMain: boolean
  ) {
    try {
      return this.Module._resolveFilename(moduleUri, parent, isMain)
    } catch (err) {
      if (fullPath != null) {
        try {
          // Resolving moduleUri directly didn't work, let's try again with the full path our algorithm figured out
          const res = this.Module._resolveFilename(fullPath, parent, isMain)
          return res
        } catch (err2) {
          // In some cases like native addons which aren't included in the esbuild bundle we need to try to resolve
          // relative to the project base dir
          try {
            const basedOnProjectRoot = path.resolve(
              this.projectBaseDir,
              moduleUri
            )
            const res = this.Module._resolveFilename(
              basedOnProjectRoot,
              parent,
              isMain
            )
            logTrace(
              'Resolved "%s" based on project root to "%s"',
              moduleUri,
              basedOnProjectRoot
            )
            return res
          } catch (err3) {
            // Throwing original error on purpose
            throw err
          }
        }
      } else {
        throw err
      }
    }
  }

  private _tryResolveFullPath(
    moduleUri: string,
    moduleRelativePath?: string,
    opts?: GetModuleKeyOpts
  ): string | undefined {
    if (moduleRelativePath != null) {
      return path.resolve(this.projectBaseDir, moduleRelativePath)
    }
    if (opts != null && moduleUri.startsWith('.')) {
      return path.resolve(opts.path, moduleUri)
    }
  }

  private _ensureFullPathExportsModule(mod: NodeModule) {
    if (mod.id == null) mod.id = mod.filename
    if (mod.id != null && needsFullPathResolve(mod.id)) {
      mod.id = path.resolve(this.projectBaseDir, mod.id)
    }
    if (mod.filename != null && needsFullPathResolve(mod.filename)) {
      mod.filename = path.resolve(this.projectBaseDir, mod.filename)
    }
    if (mod.path != null && needsFullPathResolve(mod.path)) {
      mod.path = path.resolve(this.projectBaseDir, mod.path)
    }
  }

  private _ensureParentPaths(parent: { path: string; paths?: string[] }) {
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

/**
 * Mimics a Node.js` MODULE_NOT_FOUND` error in order to not break apps that depend on the `err.code` exactly.
 */
function moduleNotFoundError(msg: string, moduleUri: string) {
  // https://github.com/nodejs/node/blob/da0ede1ad55a502a25b4139f58aab3fb1ee3bf3f/lib/internal/modules/cjs/loader.js#L353-L359
  const err = new Error(msg)
  // @ts-ignore replicating Node.js module not found error
  err.code = 'MODULE_NOT_FOUND'
  // @ts-ignore replicating Node.js module not found error
  err.path = moduleUri
  // @ts-ignore replicating Node.js module not found error
  err.requestPath = moduleUri
  return err
}

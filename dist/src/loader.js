"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackherdModuleLoader = void 0;
const debug_1 = __importDefault(require("debug"));
const module_1 = __importDefault(require("module"));
const path_1 = __importDefault(require("path"));
const assert_1 = require("assert");
const logDebug = (0, debug_1.default)('packherd:debug');
const logTrace = (0, debug_1.default)('packherd:trace');
const logSilly = (0, debug_1.default)('packherd:silly');
const logWarn = (0, debug_1.default)('packherd:warn');
const defaultGetModuleKey = ({ moduleUri, baseDir }) => {
    const moduleRelativePath = path_1.default.relative(baseDir, moduleUri);
    return { moduleKey: `./${moduleRelativePath}`, moduleRelativePath };
};
class LoadingModules {
    constructor() {
        this.currentlyLoading = new Map();
    }
    start(id, mod) {
        if (this.currentlyLoading.has(id)) {
            throw new Error(`Already loading ${id}\nstack: ${this.stack()}`);
        }
        this.currentlyLoading.set(id, mod);
    }
    retrieve(id) {
        return this.currentlyLoading.get(id);
    }
    finish(id) {
        this.currentlyLoading.delete(id);
    }
    stack() {
        return Array.from(this.currentlyLoading.keys());
    }
}
function defaultModuleNeedsReload(moduleId, loadedModules, moduleCache) {
    return loadedModules.has(moduleId) && moduleCache == null;
}
class CacheTracker {
    constructor(_moduleCache, _moduleExports, _moduleNeedsReload) {
        this._moduleCache = _moduleCache;
        this._moduleExports = _moduleExports;
        this._moduleNeedsReload = _moduleNeedsReload;
        this._loadedModules = new Set();
    }
    addLoadedById(id) {
        this._loadedModules.add(id);
    }
    addLoaded(mod, resolved, origin, moduleKey) {
        (0, assert_1.strict)(mod.id != null, `Should have module id when loading by ${resolved} via ${origin} succeeded`);
        this._moduleCache[mod.id] = mod;
        if (moduleKey != null) {
            this._moduleExports[moduleKey] = mod;
        }
        this._loadedModules.add(mod.id);
        if (logTrace.enabled) {
            logTrace('Loaded "%s" (%s | %s) -> moduleCache: %d, exportsCache: %d, loaded: %d', mod.id, resolved, origin, Object.keys(this._moduleCache).length, Object.keys(this._moduleExports).length, this._loadedModules.size);
        }
    }
    moduleNeedsReload(mod) {
        // We update our exports cache when loading a module, thus if it came from there
        // and doesn't have one yet that means that it was never loaded before
        if (mod.id == null)
            return false;
        return this._moduleNeedsReload(mod.id, this._loadedModules, this._moduleCache);
    }
}
function needsFullPathResolve(p) {
    return !path_1.default.isAbsolute(p) && p.startsWith('./');
}
class PackherdModuleLoader {
    constructor(Module, origLoad, projectBaseDir, benchmark, opts) {
        var _a, _b, _c;
        this.Module = Module;
        this.origLoad = origLoad;
        this.projectBaseDir = projectBaseDir;
        this.benchmark = benchmark;
        this.exportHits = new Set();
        this.definitionHits = new Set();
        this.misses = new Set();
        this.diagnostics = !!opts.diagnostics;
        this._dumpedInfo = { exportHits: 0, definitionHits: 0, misses: 0 };
        this.getModuleKey = opts.getModuleKey || defaultGetModuleKey;
        (0, assert_1.strict)(opts.moduleExports != null || opts.moduleDefinitions != null, 'need to provide moduleDefinitions, moduleDefinitions or both');
        this.moduleExports = (_a = opts.moduleExports) !== null && _a !== void 0 ? _a : {};
        this.moduleDefinitions = (_b = opts.moduleDefinitions) !== null && _b !== void 0 ? _b : {};
        this.loading = new LoadingModules();
        this.cacheTracker = new CacheTracker(this.Module._cache, this.moduleExports, (_c = opts.moduleNeedsReload) !== null && _c !== void 0 ? _c : defaultModuleNeedsReload);
    }
    // -----------------
    // Loading within Exports Cache
    // -----------------
    shouldBypassCache(mod) {
        this._ensureFullPathExportsModule(mod);
        return this.cacheTracker.moduleNeedsReload(mod);
    }
    registerModuleLoad(mod, loadedFrom) {
        this._ensureFullPathExportsModule(mod);
        this.cacheTracker.addLoaded(mod, 'cache', loadedFrom);
        switch (loadedFrom) {
            case 'exports':
                this.exportHits.add(mod.id);
                break;
            case 'definitions':
                this.definitionHits.add(mod.id);
                break;
            case 'Node.js require':
                this.misses.add(mod.id);
                break;
            default:
                // not counting loads from Node.js cache or the ones already counted via tryLoad
                break;
        }
        this._dumpInfo();
    }
    // -----------------
    // Cache Direct
    // -----------------
    _tryCacheDirect(fullPath, moduleKey) {
        if (moduleKey == null)
            return {};
        const mod = this.moduleExports[moduleKey];
        if (mod != null) {
            mod.filename = fullPath;
            mod.id = fullPath;
            mod.path = path_1.default.dirname(fullPath);
            // @ts-ignore parent deprecated
            if (mod.parent != null) {
                // @ts-ignore parent deprecated
                this._ensureFullPathExportsModule(mod.parent);
            }
            if (!this.cacheTracker.moduleNeedsReload(mod)) {
                const moduleExport = mod.exports;
                return {
                    moduleExports: moduleExport,
                };
            }
        }
        const definition = this.moduleDefinitions[moduleKey];
        return {
            definition,
        };
    }
    _loadCacheDirect(moduleUri, moduleKey, fullPath, parent) {
        if (parent == null || moduleKey == null) {
            return undefined;
        }
        (0, assert_1.strict)(fullPath != null, 'fullPath should be set when moduleKey was provided');
        const direct = this._tryCacheDirect(fullPath, moduleKey);
        if ((direct === null || direct === void 0 ? void 0 : direct.moduleExports) != null) {
            const { mod, origin } = this._initModuleFromExport(moduleKey, direct.moduleExports, parent, fullPath);
            return {
                resolved: 'cache:direct',
                origin,
                exports: mod.exports,
                mod,
                fullPath: mod.path,
            };
        }
        if ((direct === null || direct === void 0 ? void 0 : direct.definition) != null) {
            const { mod, origin } = this._initModuleFromDefinition(moduleUri, direct.definition, parent, fullPath);
            if (mod != null) {
                return {
                    resolved: 'cache:direct',
                    origin,
                    exports: mod.exports,
                    mod,
                    fullPath: mod.path,
                };
            }
        }
        return undefined;
    }
    tryResolve(moduleUri, opts) {
        // 1. Resolve via module key
        let { moduleKey, moduleRelativePath } = this.getModuleKey({
            moduleUri,
            baseDir: this.projectBaseDir,
            opts,
        });
        if (moduleKey != null && path_1.default.isAbsolute(moduleKey)) {
            return { fullPath: moduleKey, resolved: 'module-key:node' };
        }
        // 2. Try to obtain a full path via the resolved relative path
        let fullPath = this._tryResolveFullPath(moduleUri, moduleRelativePath, opts);
        if (fullPath != null) {
            return { fullPath, resolved: 'module-fullpath:node' };
        }
        // 3. Lastly try to resolve the module via Node.js resolution
        if (opts != null) {
            this._ensureParentPaths(opts);
        }
        if (!path_1.default.isAbsolute(moduleUri) &&
            (opts == null || opts.id == null)) {
            const msg = `Cannot resolve module '${moduleUri}'.` +
                `Need a parent to resolve via Node.js when relative path is provided.`;
            throw moduleNotFoundError(msg, moduleUri);
        }
        const directFullPath = fullPath;
        let resolved;
        ({ resolved, fullPath } = this._resolvePaths(moduleUri, opts, false, directFullPath));
        return { fullPath, resolved };
    }
    tryLoad(moduleUri, parent, isMain) {
        var _a;
        // 1. Try to find moduleUri directly in Node.js module cache
        if (path_1.default.isAbsolute(moduleUri)) {
            const moduleCached = this.Module._cache[moduleUri];
            if (moduleCached != null) {
                const fullPath = moduleUri;
                const resolved = 'module-uri:node';
                return {
                    resolved,
                    origin: 'Module._cache',
                    exports: moduleCached.exports,
                    fullPath,
                };
            }
        }
        let moduleKey;
        let moduleRelativePath;
        // 2. Try to obtain a module key, this could be from a map or the relative path
        if (parent != null) {
            ;
            ({ moduleKey, moduleRelativePath } = this.getModuleKey({
                moduleUri,
                baseDir: this.projectBaseDir,
                opts: parent,
            }));
        }
        // 3. Try to see if the moduleKey was correct and can be loaded from the Node.js cache
        if (moduleKey != null && path_1.default.isAbsolute(moduleKey)) {
            const moduleCached = this.Module._cache[moduleKey];
            if (moduleCached != null) {
                const fullPath = moduleKey;
                const resolved = 'module-key:node';
                const origin = 'Module._cache';
                this.cacheTracker.addLoaded(moduleCached, resolved, origin, moduleKey);
                return {
                    resolved,
                    origin,
                    exports: moduleCached.exports,
                    fullPath,
                };
            }
        }
        let fullPath;
        if (parent != null) {
            // 4. Try to obtain a full path
            this._ensureParentPaths(parent);
            fullPath =
                (_a = this._tryResolveFullPath(moduleUri, moduleRelativePath, parent)) !== null && _a !== void 0 ? _a : moduleUri;
            // 5. Try again in the Node.js module cache
            if (fullPath != null && fullPath !== moduleUri) {
                const moduleCached = this.Module._cache[fullPath];
                if (moduleCached != null) {
                    const resolved = 'module-fullpath:node';
                    const origin = 'Module._cache';
                    this.cacheTracker.addLoaded(moduleCached, resolved, origin, moduleKey);
                    return {
                        resolved,
                        origin,
                        exports: moduleCached.exports,
                        fullPath,
                    };
                }
            }
            // 6. Try to locate this module inside the cache, either export or definition
            let loadedModule = this._loadCacheDirect(moduleUri, moduleKey, fullPath, parent);
            if (loadedModule != null) {
                this._dumpInfo();
                this.cacheTracker.addLoaded(loadedModule.mod, loadedModule.resolved, loadedModule.origin, moduleKey);
                return loadedModule;
            }
        }
        // 7. Lastly try to resolve the module via Node.js resolution which requires expensive I/O and may fail
        //    in which case it throws an error
        this.benchmark.time(moduleUri);
        const directFullPath = fullPath !== null && fullPath !== void 0 ? fullPath : moduleUri;
        let resolved;
        ({ resolved, fullPath } = this._resolvePaths(moduleUri, parent, isMain, directFullPath));
        // 8. Something like './foo' might now have been resolved to './foo.js' and
        // thus we may find it inside our cache that way
        const derivedModuleKey = `./${path_1.default.relative(this.projectBaseDir, fullPath)}`;
        const loadedModule = this._loadCacheDirect(moduleUri, derivedModuleKey, fullPath, parent);
        if (loadedModule != null) {
            this._dumpInfo();
            loadedModule.resolved = 'cache:node';
            this.cacheTracker.addLoaded(loadedModule.mod, loadedModule.resolved, loadedModule.origin, moduleKey);
            return loadedModule;
        }
        const exports = this.origLoad(fullPath, parent, isMain);
        // Node.js load only returns the `exports` object thus we need to get the
        // module itself from the cache to which it was added during load
        const nodeModule = this.Module._cache[fullPath];
        this._dumpInfo();
        this.benchmark.timeEnd(moduleUri, 'Module._load', this.loading.stack());
        const origin = 'Module._load';
        if (nodeModule != null) {
            this.misses.add(nodeModule.id);
            this.cacheTracker.addLoaded(nodeModule, resolved, origin, moduleKey);
        }
        else {
            this.misses.add(fullPath);
            this.cacheTracker.addLoadedById(fullPath);
        }
        return {
            resolved,
            origin,
            exports,
            fullPath,
        };
    }
    _dumpInfo() {
        if (this.diagnostics && logDebug.enabled) {
            const { exportHits: prevExportHits, definitionHits: prevDefinitionHits, misses: prevMisses, } = this._dumpedInfo;
            const exportHits = this.exportHits.size;
            const definitionHits = this.definitionHits.size;
            const misses = this.misses.size;
            if (prevExportHits !== exportHits ||
                prevDefinitionHits !== definitionHits ||
                prevMisses !== misses) {
                this._dumpedInfo = {
                    exportHits,
                    definitionHits,
                    misses,
                };
                logDebug(this._dumpedInfo);
            }
        }
    }
    _resolvePaths(moduleUri, parent, isMain, directFullPath) {
        const resolved = 'module:node';
        const fullPath = this._tryResolveFilename(moduleUri, directFullPath, parent, isMain);
        return { resolved, fullPath };
    }
    // -----------------
    // Module Initialization
    // -----------------
    _createModule(fullPath, parent, moduleUri) {
        var _a;
        const require = this.diagnostics
            ? this._interceptedRequire(fullPath, moduleUri, parent)
            : this._createRequire(fullPath, moduleUri, parent);
        return {
            children: [],
            exports: {},
            filename: fullPath,
            id: fullPath,
            loaded: false,
            parent,
            path: fullPath,
            // TODO(thlorenz): not entirely correct if parent is nested deeper or higher
            paths: (_a = parent === null || parent === void 0 ? void 0 : parent.paths) !== null && _a !== void 0 ? _a : [],
            require,
        };
    }
    _initModuleFromExport(moduleUri, moduleExports, parent, fullPath) {
        const mod = this._createModule(fullPath, parent, moduleUri);
        mod.exports = moduleExports;
        mod.loaded = true;
        const origin = 'packherd:export';
        this.exportHits.add(mod.id);
        return { mod, origin };
    }
    _initModuleFromDefinition(moduleUri, moduleDefinition, parent, fullPath) {
        const origin = 'packherd:definition';
        const loading = this.loading.retrieve(fullPath);
        if (loading != null)
            return { mod: loading, origin };
        const mod = this._createModule(fullPath, parent, moduleUri);
        try {
            this.loading.start(fullPath, mod);
            moduleDefinition(mod.exports, mod, fullPath, path_1.default.dirname(fullPath), mod.require);
            mod.loaded = true;
            this.definitionHits.add(mod.id);
            return { mod, origin };
        }
        catch (err) {
            logWarn(err.message);
            logSilly(err);
            return { mod: undefined, origin };
        }
        finally {
            this.loading.finish(fullPath);
        }
    }
    _createRequire(fullPath, moduleUri, parent) {
        const require = this.Module.createRequire(fullPath);
        if (parent == null) {
            parent = this._createModule(fullPath, parent, moduleUri);
        }
        require.resolve = Object.assign((moduleUri, _options) => {
            return this.tryResolve(moduleUri, parent).fullPath;
        }, {
            paths(request) {
                var _a;
                if (module_1.default.builtinModules.includes(request))
                    return null;
                return (_a = parent === null || parent === void 0 ? void 0 : parent.paths) !== null && _a !== void 0 ? _a : null;
            },
        });
        return require;
    }
    _interceptedRequire(fullPath, moduleUri, parent) {
        const require = this._createRequire(fullPath, moduleUri, parent);
        const override = function (id) {
            logTrace('Module "%s" is requiring "%s"', moduleUri, id);
            return require.call(this, id);
        };
        override.main = require.main;
        override.cache = require.cache;
        // @ts-ignore deprecated
        override.extensions = require.extensions;
        override.resolve = require.resolve.bind(require);
        return override;
    }
    // -----------------
    // Helpers
    // -----------------
    _tryResolveFilename(moduleUri, fullPath, parent, isMain) {
        try {
            return this.Module._resolveFilename(moduleUri, parent, isMain);
        }
        catch (err) {
            if (fullPath != null) {
                try {
                    // Resolving moduleUri directly didn't work, let's try again with the full path our algorithm figured out
                    const res = this.Module._resolveFilename(fullPath, parent, isMain);
                    return res;
                }
                catch (err2) {
                    // In some cases like native addons which aren't included in the esbuild bundle we need to try to resolve
                    // relative to the project base dir
                    try {
                        const basedOnProjectRoot = path_1.default.resolve(this.projectBaseDir, moduleUri);
                        const res = this.Module._resolveFilename(basedOnProjectRoot, parent, isMain);
                        logTrace('Resolved "%s" based on project root to "%s"', moduleUri, basedOnProjectRoot);
                        return res;
                    }
                    catch (err3) {
                        // Throwing original error on purpose
                        throw err;
                    }
                }
            }
            else {
                throw err;
            }
        }
    }
    _tryResolveFullPath(moduleUri, moduleRelativePath, opts) {
        if (moduleRelativePath != null) {
            return path_1.default.resolve(this.projectBaseDir, moduleRelativePath);
        }
        if (opts != null && moduleUri.startsWith('.')) {
            return path_1.default.resolve(opts.path, moduleUri);
        }
    }
    _ensureFullPathExportsModule(mod) {
        if (mod.id == null)
            mod.id = mod.filename;
        if (mod.id != null && needsFullPathResolve(mod.id)) {
            mod.id = path_1.default.resolve(this.projectBaseDir, mod.id);
        }
        if (mod.filename != null && needsFullPathResolve(mod.filename)) {
            mod.filename = path_1.default.resolve(this.projectBaseDir, mod.filename);
        }
        if (mod.path != null && needsFullPathResolve(mod.path)) {
            mod.path = path_1.default.resolve(this.projectBaseDir, mod.path);
        }
    }
    _ensureParentPaths(parent) {
        if (parent.paths == null ||
            (parent.paths.length === 0 && parent.path != null)) {
            let dir = path_1.default.resolve(this.projectBaseDir, parent.path);
            parent.paths = [];
            while (dir.length > this.projectBaseDir.length) {
                parent.paths.push(path_1.default.join(dir, 'node_modules'));
                dir = path_1.default.dirname(dir);
            }
            parent.paths.push(path_1.default.join(dir, 'node_modules'));
        }
    }
}
exports.PackherdModuleLoader = PackherdModuleLoader;
function moduleNotFoundError(msg, moduleUri) {
    // https://github.com/nodejs/node/blob/da0ede1ad55a502a25b4139f58aab3fb1ee3bf3f/lib/internal/modules/cjs/loader.js#L353-L359
    const err = new Error(msg);
    // @ts-ignore replicating Node.js module not found error
    err.code = 'MODULE_NOT_FOUND';
    // @ts-ignore replicating Node.js module not found error
    err.path = moduleUri;
    // @ts-ignore replicating Node.js module not found error
    err.requestPath = moduleUri;
    return err;
}
//# sourceMappingURL=loader.js.map
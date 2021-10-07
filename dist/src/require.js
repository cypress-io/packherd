"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.packherdRequire = void 0;
const debug_1 = __importDefault(require("debug"));
const benchmark_1 = require("./benchmark");
const default_transpile_cache_1 = require("./default-transpile-cache");
const loader_1 = require("./loader");
const sourcemap_support_1 = require("./sourcemap-support");
const path_1 = __importDefault(require("path"));
const logInfo = (0, debug_1.default)('packherd:info');
const logDebug = (0, debug_1.default)('packherd:debug');
const logTrace = (0, debug_1.default)('packherd:trace');
const logError = (0, debug_1.default)('packherd:error');
__exportStar(require("./loader"), exports);
const DEFAULT_TRANSPILE_OPTS = {
    supportTS: false,
};
function packherdRequire(projectBaseDir, opts) {
    var _a, _b;
    const Module = require('module');
    const { supportTS, initTranspileCache, tsconfig } = Object.assign({}, DEFAULT_TRANSPILE_OPTS, opts.transpileOpts);
    const diagnostics = (_a = opts.diagnostics) !== null && _a !== void 0 ? _a : false;
    const cache = initTranspileCache == null
        ? new default_transpile_cache_1.DefaultTranspileCache()
        : (_b = initTranspileCache(projectBaseDir, {
            cacheDir: '/tmp/packherd-cache',
        })) !== null && _b !== void 0 ? _b : new default_transpile_cache_1.DefaultTranspileCache();
    if (supportTS) {
        logInfo('Enabling TS support');
        logDebug({ supportTS, initTranspileCache, tsconfig });
        const { hookTranspileTs } = require('./transpile-ts');
        hookTranspileTs(Module, projectBaseDir, logInfo, diagnostics, cache, opts.sourceMapLookup, tsconfig);
    }
    else {
        (0, sourcemap_support_1.installSourcemapSupport)(cache, projectBaseDir, opts.sourceMapLookup);
    }
    const exportKeysLen = opts.moduleExports != null ? Object.keys(opts.moduleExports).length : 0;
    const definitionKeysLen = opts.moduleDefinitions != null
        ? Object.keys(opts.moduleDefinitions).length
        : 0;
    logInfo('packherd defining %d exports and %d definitions!', exportKeysLen, definitionKeysLen);
    logInfo({ projectBaseDir });
    // Even though packherd is designed to support loading from these caches we
    // also support using it for on the fly TypeScript transpilation only.
    // In that case the necessary extensions hook was applied above and no
    // further work is needed.
    if (exportKeysLen === 0 && definitionKeysLen === 0) {
        logInfo('No moduleExports nor moduleDefinitions provided, not hooking Module._load');
        return { resolve: require.resolve.bind(require) };
    }
    const benchmark = (0, benchmark_1.setupBenchmark)(projectBaseDir, opts.requireStatsFile);
    const origLoad = Module._load;
    const moduleLoader = new loader_1.PackherdModuleLoader(Module, origLoad, projectBaseDir, benchmark, opts);
    //
    // Module._load override
    //
    Module._load = function (moduleUri, parent, isMain) {
        logTrace('Module._load "%s"', moduleUri);
        if (Module.builtinModules.includes(moduleUri)) {
            return origLoad(moduleUri, parent, isMain);
        }
        try {
            const { resolved, origin, exports, fullPath } = moduleLoader.tryLoad(moduleUri, parent, isMain);
            const moduleRelativePath = path_1.default.relative(projectBaseDir, fullPath);
            switch (resolved) {
                case 'module:node':
                case 'module-uri:node':
                case 'module-fullpath:node':
                case 'module-key:node':
                case 'cache:node': {
                    logTrace('Resolved "%s" via %s (%s | %s)', moduleUri, resolved, moduleRelativePath, fullPath);
                    break;
                }
                case 'path': {
                    logDebug('Resolved "%s" via %s (%s | %s)', moduleUri, resolved, moduleRelativePath, fullPath);
                    break;
                }
            }
            switch (origin) {
                case 'Module._load': {
                    logTrace('Loaded "%s" via %s resolved as (%s | %s)', moduleUri, origin, moduleRelativePath, fullPath);
                    break;
                }
                case 'packherd:export':
                case 'packherd:definition':
                case 'packherd:loading': {
                    logTrace('Loaded "%s" via (%s | %s)', moduleUri, origin, resolved);
                    break;
                }
            }
            return exports;
        }
        catch (err) {
            if (diagnostics && !moduleUri.endsWith('hook-require')) {
                logError(err);
                debugger;
            }
        }
    };
    return {
        resolve(uri, opts) {
            return moduleLoader.tryResolve(uri, opts).fullPath;
        },
        shouldBypassCache: moduleLoader.shouldBypassCache.bind(moduleLoader),
        registerModuleLoad: moduleLoader.registerModuleLoad.bind(moduleLoader),
        tryLoad: moduleLoader.tryLoad.bind(moduleLoader),
    };
}
exports.packherdRequire = packherdRequire;
//# sourceMappingURL=require.js.map
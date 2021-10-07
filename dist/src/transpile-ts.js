"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hookTranspileTs = exports.transpileTsCode = exports.transpileTs = void 0;
const esbuild_1 = require("esbuild");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sourcemap_support_1 = require("./sourcemap-support");
const transpile_ts_rewrite_1 = require("./transpile-ts-rewrite");
const DEFAULT_TRANSFORM_OPTS = {
    target: ['node14.5'],
    loader: 'ts',
    format: 'cjs',
    sourcemap: 'inline',
    minify: false,
};
function transpileTs(fullModuleUri, cache, projectBaseDir, sourceMapLookup, tsconfig) {
    const cached = (cache != null && cache.get(fullModuleUri)) || null;
    if (cached != null)
        return cached;
    const ts = fs_1.default.readFileSync(fullModuleUri, 'utf8');
    return transpileTsCode(fullModuleUri, ts, cache, projectBaseDir, sourceMapLookup, tsconfig);
}
exports.transpileTs = transpileTs;
function transpileTsCode(fullModuleUri, ts, cache, projectBaseDir, sourceMapLookup, 
// TODO: consider 'error' for importsNotUsedAsValues (maybe) to add some type checking
tsconfig) {
    (0, sourcemap_support_1.installSourcemapSupport)(cache, projectBaseDir, sourceMapLookup);
    const cached = (cache != null && cache.get(fullModuleUri)) || null;
    if (cached != null)
        return cached;
    const opts = Object.assign({}, DEFAULT_TRANSFORM_OPTS, {
        tsconfigRaw: tsconfig,
        sourcefile: fullModuleUri,
    });
    const result = (0, esbuild_1.transformSync)(ts, opts);
    const code = (0, transpile_ts_rewrite_1.rewriteExports)(result.code);
    if (cache != null) {
        cache.add(fullModuleUri, code);
    }
    return code;
}
exports.transpileTsCode = transpileTsCode;
function hookTranspileTs(Module, projectBaseDir, log, diagnostics, cache, sourceMapLookup, tsconfig) {
    (0, sourcemap_support_1.installSourcemapSupport)(cache, projectBaseDir, sourceMapLookup);
    const defaultLoader = Module._extensions['.js'];
    Module._extensions['.ts'] = function (mod, filename) {
        const origCompile = mod._compile;
        // NOTE: I benchmarked that bypassing the laoder to avoid reading `code`
        // that goes unused in case the transpiled version is already in the cache.
        // That optimiziation does not make a notable difference and thus we opt of
        // the more robust approach of using the Node.js builtin compile which also
        // provides internal Node.js cache checks.
        mod._compile = (code) => {
            mod._compile = origCompile;
            try {
                log('transpiling %s', path_1.default.relative(projectBaseDir, filename));
                const transpiled = transpileTsCode(filename, code, cache, projectBaseDir, sourceMapLookup, tsconfig);
                const compiled = mod._compile(transpiled, filename);
                return compiled;
            }
            catch (err) {
                console.error(err);
                if (diagnostics) {
                    debugger;
                }
                return mod._compile(code, filename);
            }
        };
        defaultLoader(mod, filename);
    };
}
exports.hookTranspileTs = hookTranspileTs;
//# sourceMappingURL=transpile-ts.js.map
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
exports.packherd = exports.getSourceMapAndContent = exports.getSourceMap = exports.packherdRequire = void 0;
const path_1 = __importDefault(require("path"));
const assert_1 = require("assert");
const create_bundle_1 = require("./create-bundle");
const generate_entry_1 = require("./generate-entry");
const utils_1 = require("./utils");
var require_1 = require("./require");
Object.defineProperty(exports, "packherdRequire", { enumerable: true, get: function () { return require_1.packherdRequire; } });
__exportStar(require("./types"), exports);
var sourcemap_support_1 = require("./sourcemap-support");
Object.defineProperty(exports, "getSourceMap", { enumerable: true, get: function () { return sourcemap_support_1.getSourceMap; } });
Object.defineProperty(exports, "getSourceMapAndContent", { enumerable: true, get: function () { return sourcemap_support_1.getSourceMapAndContent; } });
async function packherd(opts) {
    const createBundle = opts.createBundle || create_bundle_1.createBundle;
    const entryGenerator = new generate_entry_1.EntryGenerator(createBundle, opts.entryFile, opts.nodeModulesOnly, opts.pathsMapper);
    const { entry } = await entryGenerator.createEntryScript();
    const { outfile } = (0, utils_1.tmpFilePaths)();
    const { outputFiles, metafile, sourceMap: sourceMapFile, warnings, } = await createBundle({
        outdir: path_1.default.dirname(outfile),
        metafile: true,
        entryFilePath: opts.entryFile,
        stdin: {
            contents: entry,
            sourcefile: opts.entryFile,
            resolveDir: path_1.default.dirname(opts.entryFile),
        },
    });
    (0, assert_1.strict)(metafile != null, 'createBundle should return metafile');
    // When using the `stdin` option esbuild sends the same outputFile twice, as
    // .../stdin.js and .../entry.js
    (0, assert_1.strict)(outputFiles.length === 1 || outputFiles.length === 2, `expecting exactly one or two outputFiles, got ${outputFiles.length} instead`);
    const [bundleFile] = outputFiles;
    (0, assert_1.strict)(bundleFile.contents != null, 'bundle output should include contents');
    const bundle = Buffer.isBuffer(bundleFile.contents)
        ? bundleFile.contents
        : Buffer.from(bundleFile.contents);
    const sourceMap = sourceMapFile == null
        ? undefined
        : Buffer.isBuffer(sourceMapFile === null || sourceMapFile === void 0 ? void 0 : sourceMapFile.contents)
            ? sourceMapFile.contents
            : Buffer.from(sourceMapFile.contents);
    return {
        bundle,
        sourceMap,
        meta: metafile,
        warnings,
    };
}
exports.packherd = packherd;
//# sourceMappingURL=packherd.js.map
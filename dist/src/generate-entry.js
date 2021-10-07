"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntryGenerator = exports.identityMapper = void 0;
const path_1 = __importDefault(require("path"));
const get_metadata_1 = require("./get-metadata");
const packherd = require('../../package.json').name;
const identityMapper = (s) => s;
exports.identityMapper = identityMapper;
class EntryGenerator {
    constructor(createBundle, entryFile, nodeModulesOnly = true, pathsMapper = exports.identityMapper) {
        this.createBundle = createBundle;
        this.entryFile = entryFile;
        this.nodeModulesOnly = nodeModulesOnly;
        this.pathsMapper = pathsMapper;
        this.entryDirectory = path_1.default.dirname(entryFile);
    }
    async createEntryScript() {
        const meta = await this._getMetadata();
        const relToCwdPaths = this._resolveRelativePaths(meta);
        relToCwdPaths.sort();
        const fullPaths = relToCwdPaths.map((x) => path_1.default.join(process.cwd(), x));
        const paths = fullPaths.map((x) => path_1.default.relative(this.entryDirectory, x));
        const entry = ['// vim: set ft=text:']
            .concat(paths.map((x) => `exports['./${x}'] = require('./${x}')`))
            .join('\n');
        return { paths, entry };
    }
    _getMetadata() {
        return (0, get_metadata_1.getMetadata)(this.createBundle, this.entryFile, this.entryDirectory);
    }
    _resolveRelativePaths(meta) {
        let relPaths = Object.keys(meta.inputs).filter((x) => !x.includes(packherd));
        if (this.nodeModulesOnly) {
            relPaths = relPaths.filter((x) => x.includes('node_modules'));
        }
        return relPaths
            .map((x) => x.replace(/^node_modules\//, './node_modules/'))
            .map(this.pathsMapper);
    }
}
exports.EntryGenerator = EntryGenerator;
//# sourceMappingURL=generate-entry.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tmpFilePaths = exports.ensureDirSync = exports.canAccessSync = void 0;
const fs_1 = __importDefault(require("fs"));
const os_1 = require("os");
const path_1 = __importDefault(require("path"));
function canAccessSync(p) {
    try {
        fs_1.default.accessSync(p);
        return true;
    }
    catch (_) {
        return false;
    }
}
exports.canAccessSync = canAccessSync;
function ensureDirSync(dir) {
    if (!canAccessSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
        return;
    }
    // dir already exists, make sure it isn't a file
    const stat = fs_1.default.statSync(dir);
    if (!stat.isDirectory()) {
        throw new Error(`'${dir}' is not a directory`);
    }
}
exports.ensureDirSync = ensureDirSync;
function tmpFilePaths() {
    const bundleTmpDir = path_1.default.join((0, os_1.tmpdir)(), 'packherd');
    ensureDirSync(bundleTmpDir);
    const outfile = path_1.default.join(bundleTmpDir, 'bundle.js');
    return { outfile };
}
exports.tmpFilePaths = tmpFilePaths;
//# sourceMappingURL=utils.js.map
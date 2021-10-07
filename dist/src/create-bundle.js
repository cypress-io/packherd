"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBundle = void 0;
const esbuild_1 = require("esbuild");
const DEFAULT_BUNDLE_OPTS = {
    platform: 'node',
    target: ['node14.5'],
};
function createBundle(args) {
    const opts = Object.assign({}, DEFAULT_BUNDLE_OPTS, args, {
        entryPoints: [args.entryFilePath],
        bundle: true,
        write: false,
    });
    // This is not ideal, but esbuild throws if it encounters an unknown opt
    // @ts-ignore
    delete opts.entryFilePath;
    // NOTE: we just changed Output file to either have text: string or contents: UInt8Array, never both
    return (0, esbuild_1.build)(opts);
}
exports.createBundle = createBundle;
//# sourceMappingURL=create-bundle.js.map
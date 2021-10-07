"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMetadata = void 0;
const assert_1 = require("assert");
async function getMetadata(createBundle, entryFilePath, outbase) {
    const { metafile } = await createBundle({
        metafile: true,
        outfile: '<stdout:out>',
        entryFilePath,
        outbase,
    });
    (0, assert_1.strict)(metafile != null, 'createBundle should return result with metaFile');
    return metafile;
}
exports.getMetadata = getMetadata;
//# sourceMappingURL=get-metadata.js.map
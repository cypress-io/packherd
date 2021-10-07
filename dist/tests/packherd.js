"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const packherd_1 = require("../src/packherd");
const tape_1 = __importDefault(require("tape"));
const spok_1 = __importDefault(require("spok"));
(0, tape_1.default)('packherd minimal: resolves paths relative to entry and creates entry content', async (t) => {
    const entryFile = require.resolve('../../tests/fixtures/minimal/entry.js');
    const { meta, bundle } = await (0, packherd_1.packherd)({ entryFile });
    (0, spok_1.default)(t, meta, {
        inputs: {
            'tests/fixtures/minimal/node_modules/isobject/index.cjs.js': {
                bytes: spok_1.default.ge(200),
            },
            'tests/fixtures/minimal/node_modules/tmpfile/index.js': {
                bytes: spok_1.default.ge(800),
            },
            'tests/fixtures/minimal/entry.js': {
                bytes: spok_1.default.ge(100),
                imports: [
                    {
                        path: 'tests/fixtures/minimal/node_modules/isobject/index.cjs.js',
                    },
                    {
                        path: 'tests/fixtures/minimal/node_modules/tmpfile/index.js',
                    },
                ],
            },
        },
    });
    (0, spok_1.default)(t, bundle, { length: spok_1.default.ge(1700) });
    t.end();
});
(0, tape_1.default)('packherd minimal: custom create bundle', async (t) => {
    const bundleStub = {
        contents: Buffer.from('// Unused bundle content', 'utf8'),
    };
    const metafile = {
        inputs: {
            'tests/fixtures/minimal/node_modules/foo/foo.js': { bytes: 111 },
            'tests/fixtures/minimal/lib/bar.js': { bytes: 1 },
            'tests/fixtures/minimal/node_modules/baz/baz.js': { bytes: 222 },
        },
    };
    const createBundle = (_opts) => {
        const result = {
            warnings: [],
            outputFiles: [bundleStub],
            metafile,
        };
        return Promise.resolve(result);
    };
    const entryFile = require.resolve('../../tests/fixtures/minimal/entry.js');
    const { meta, bundle } = await (0, packherd_1.packherd)({ entryFile, createBundle });
    (0, spok_1.default)(t, meta, metafile);
    t.equal(bundle, bundleStub.contents);
    t.end();
});
//# sourceMappingURL=packherd.js.map
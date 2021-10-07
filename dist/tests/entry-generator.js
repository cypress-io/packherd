"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tape_1 = __importDefault(require("tape"));
const create_bundle_1 = require("../src/create-bundle");
const generate_entry_1 = require("../src/generate-entry");
(0, tape_1.default)('generate minimal: resolves paths relative to entry and creates entry content', async (t) => {
    const entryFile = require.resolve('../../tests/fixtures/minimal/entry.js');
    const generator = new generate_entry_1.EntryGenerator(create_bundle_1.createBundle, entryFile);
    const { paths, entry } = await generator.createEntryScript();
    t.deepEqual(paths, [
        'node_modules/isobject/index.cjs.js',
        'node_modules/tmpfile/index.js',
    ]);
    t.equal(entry, `// vim: set ft=text:
exports['./node_modules/isobject/index.cjs.js'] = require('./node_modules/isobject/index.cjs.js')
exports['./node_modules/tmpfile/index.js'] = require('./node_modules/tmpfile/index.js')`);
    t.end();
});
(0, tape_1.default)('generate minimal: custom create bundle', async (t) => {
    const bundle = {
        contents: Buffer.from('// Unused bundle content', 'utf8'),
    };
    const metafile = {
        inputs: {
            'tests/fixtures/minimal/node_modules/foo/foo.js': {},
            'tests/fixtures/minimal/lib/bar.js': {},
            'tests/fixtures/minimal/node_modules/baz/baz.js': {},
        },
    };
    const createBundle = (_opts) => {
        const result = {
            warnings: [],
            outputFiles: [bundle],
            metafile,
        };
        return Promise.resolve(result);
    };
    const entryFile = require.resolve('../../tests/fixtures/minimal/entry.js');
    const generator = new generate_entry_1.EntryGenerator(createBundle, entryFile);
    const { paths, entry } = await generator.createEntryScript();
    t.deepEqual(paths, ['node_modules/foo/foo.js', 'node_modules/baz/baz.js'].sort());
    t.equal(entry, `// vim: set ft=text:
exports['./node_modules/baz/baz.js'] = require('./node_modules/baz/baz.js')
exports['./node_modules/foo/foo.js'] = require('./node_modules/foo/foo.js')`);
    t.end();
});
//# sourceMappingURL=entry-generator.js.map
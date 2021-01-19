import test from 'tape'
import { EntryGenerator } from '../src/generate-entry'

test('minimal example: resolves paths relative to entry and creates entry content', async (t) => {
  const entryFile = require.resolve('../../tests/fixtures/minimal/entry.js')
  const generator = new EntryGenerator(entryFile)
  const { paths, entry } = await generator.createEntryScript()
  t.deepEqual(paths, [
    'node_modules/isobject/index.cjs.js',
    'node_modules/tmpfile/index.js',
  ])
  t.equal(
    entry,
    `// vim: set ft=text:
exports['./node_modules/isobject/index.cjs.js'] = require('./node_modules/isobject/index.cjs.js')
exports['./node_modules/tmpfile/index.js'] = require('./node_modules/tmpfile/index.js')`
  )
  t.end()
})

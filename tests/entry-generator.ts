import { Metafile } from 'esbuild'
import test from 'tape'
import { createBundle } from '../src/create-bundle'
import {
  CreateBundle,
  CreateBundleOpts,
  CreateBundleOutputFile,
  CreateBundleResult,
} from '../src/packherd'

import { EntryGenerator } from '../src/generate-entry'

test('generate minimal: resolves paths relative to entry and creates entry content', async (t) => {
  const entryFile = require.resolve('../../tests/fixtures/minimal/entry.js')
  const generator = new EntryGenerator(createBundle, entryFile)
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

test('generate minimal: custom create bundle', async (t) => {
  const bundle: CreateBundleOutputFile = {
    contents: Buffer.from('// Unused bundle content', 'utf8'),
  }
  const metafile: Metafile = ({
    inputs: {
      'tests/fixtures/minimal/node_modules/foo/foo.js': {},
      'tests/fixtures/minimal/lib/bar.js': {},
      'tests/fixtures/minimal/node_modules/baz/baz.js': {},
    },
  } as unknown) as Metafile

  const createBundle: CreateBundle = (_opts: CreateBundleOpts) => {
    const result: CreateBundleResult = {
      warnings: [],
      outputFiles: [bundle],
      metafile,
    }
    return Promise.resolve(result)
  }

  const entryFile = require.resolve('../../tests/fixtures/minimal/entry.js')
  const generator = new EntryGenerator(createBundle, entryFile)
  const { paths, entry } = await generator.createEntryScript()
  t.deepEqual(
    paths,
    ['node_modules/foo/foo.js', 'node_modules/baz/baz.js'].sort()
  )
  t.equal(
    entry,
    `// vim: set ft=text:
exports['./node_modules/baz/baz.js'] = require('./node_modules/baz/baz.js')
exports['./node_modules/foo/foo.js'] = require('./node_modules/foo/foo.js')`
  )
  t.end()
})

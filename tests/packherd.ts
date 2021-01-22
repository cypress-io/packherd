import {
  CreateBundle,
  CreateBundleOpts,
  CreateBundleResult,
  CreateBundleOutputFile,
  packherd,
} from '../src/packherd'
import test from 'tape'

import spok from 'spok'
import { Metadata } from 'esbuild'

test('minimal example: resolves paths relative to entry and creates entry content', async (t) => {
  const entryFile = require.resolve('../../tests/fixtures/minimal/entry.js')
  const { meta, bundle } = await packherd({ entryFile })
  spok(t, meta, {
    inputs: {
      'tests/fixtures/minimal/node_modules/isobject/index.cjs.js': {
        bytes: spok.ge(200),
      },
      'tests/fixtures/minimal/node_modules/tmpfile/index.js': {
        bytes: spok.ge(800),
      },
      'tests/fixtures/minimal/entry.js': {
        bytes: spok.ge(100),
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
  })

  t.ok(bundle.length > 1800)

  t.end()
})

test('minimal example: custom create bundle', async (t) => {
  const bundleStub: CreateBundleOutputFile = {
    text: '// Unused bundle content',
  }
  const metadata: Metadata = ({
    inputs: {
      'tests/fixtures/minimal/node_modules/foo/foo.js': { bytes: 111 },
      'tests/fixtures/minimal/lib/bar.js': { bytes: 1 },
      'tests/fixtures/minimal/node_modules/baz/baz.js': { bytes: 222 },
    },
  } as unknown) as Metadata
  const metaStub: CreateBundleOutputFile = { text: JSON.stringify(metadata) }

  const createBundle: CreateBundle = (_opts: CreateBundleOpts) => {
    const result: CreateBundleResult = {
      warnings: [],
      outputFiles: [bundleStub, metaStub],
    }
    return Promise.resolve(result)
  }

  const entryFile = require.resolve('../../tests/fixtures/minimal/entry.js')
  const { meta, bundle } = await packherd({ entryFile, createBundle })

  spok(t, meta, metadata)
  t.equal(bundle, bundleStub.text)
  t.end()
})

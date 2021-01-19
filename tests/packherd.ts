import { packherd } from '../src/packherd'
import test from 'tape'

import spok from 'spok'

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

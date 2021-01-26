import test from 'tape'

// NOTE: these relative paths only work from the ./dist folder
require('../../../tests/fixtures/circular-deps/hook-require')
const result = require('../../../tests/fixtures/circular-deps/lib/entry')

test('circular deps', (t) => {
  t.equal(result.origin, 'definitions', 'intercepted module load')
  t.equal(result.result, 4, 'gets result')
  t.end()
})

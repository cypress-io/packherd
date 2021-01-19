const { packherdRequire } = require('../../../')
const bundleExports = require('./bundle')

function hookRequire(diagnostics) {
  const entryFile = require.resolve('./app')
  packherdRequire(bundleExports, entryFile, {
    diagnostics,
    // TODO(thlorenz): once we use our bundler this needs to be `false`
    exportsObjects: true,
  })
}

hookRequire(true)

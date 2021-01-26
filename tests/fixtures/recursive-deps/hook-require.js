const debug = require('debug')
const definitions = require('./definitions')
const { packherdRequire } = require('../../../')
const entryFile = require.resolve('./lib/entry')

const logDebug = debug('packherd:debug')

function getModuleKey(moduleRelativePath, moduleUri) {
  logDebug({ moduleRelativePath, moduleUri })
  return moduleUri
}

packherdRequire(entryFile, {
  diagnostics: true,
  moduleDefinitions: definitions,
  getModuleKey,
})

import debug from 'debug'
import { LoadInfo, PersistedLoadInfos } from 'src/benchmark'
import { canAccessSync } from '../src/utils'

const logError = debug('bench:error')

function threeDecimals(n: number) {
  return Math.round(n * 1000) / 1000
}

function makePretty([key, { duration, stack }]: [string, LoadInfo]) {
  return [key, { duration: threeDecimals(duration), stack }]
}

function byDurationReversed(
  [_1, info1]: [string, LoadInfo],
  [_2, info2]: [string, LoadInfo]
) {
  return info1.duration <= info2.duration ? 1 : -1
}

const benchFile = process.argv[2]

try {
  canAccessSync(benchFile)
} catch (err) {
  logError('Cannot access', benchFile)
}

const {
  packherdExports,
  packherdDefinitions,
  moduleLoads,
}: PersistedLoadInfos = require(benchFile)

packherdExports.sort(byDurationReversed)
packherdDefinitions.sort(byDurationReversed)
moduleLoads.sort(byDurationReversed)

const allSorted = [
  ...packherdExports,
  ...packherdDefinitions,
  ...moduleLoads,
].sort(byDurationReversed)

const result = {
  packherdExports: packherdExports.map(makePretty),
  packherdDefinitions: packherdDefinitions.map(makePretty),
  moduleLoads: moduleLoads.map(makePretty),
  allSorted: allSorted.map(makePretty),
}

console.log(JSON.stringify(result, null, 2))

import { strict as assert } from 'assert'
import { LoadInfo, PersistedLoadInfos } from 'src/benchmark'
import { canAccessSync } from '../src/utils'
import { Analyzer } from './analyzer'
import { threeDecimals } from './utils'

// @ts-ignore
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
const esbuildMetaFile = process.argv[3]

try {
  assert(benchFile != null, 'need to provide benchFile as first arg')
  canAccessSync(benchFile)
} catch (err) {
  console.error('Cannot access %s, %o', benchFile, err)
  process.exit(1)
}

try {
  assert(
    esbuildMetaFile != null,
    'need to provide esbuildMetaFile as second arg'
  )
  canAccessSync(esbuildMetaFile)
} catch (err) {
  console.error('Cannot access %s, %o', esbuildMetaFile, err)
  process.exit(1)
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

;(async () => {
  try {
    const analyzed = await new Analyzer(
      allSorted,
      require(esbuildMetaFile)
    ).analyze()

    const result = {
      // packherdExports: packherdExports.map(makePretty),
      // packherdDefinitions: packherdDefinitions.map(makePretty),
      // moduleLoads: moduleLoads.map(makePretty),
      // allSorted: allSorted.map(makePretty),
      analyzed: Array.from(analyzed),
    }

    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
})()

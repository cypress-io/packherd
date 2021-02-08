import debug from 'debug'
import { strict as assert } from 'assert'
import { writeFileSync } from 'fs'
import getTime from 'performance-now'
import { ModuleLoadResult } from './types'
import { ensureDirSync } from './utils'
import path from 'path'

const logInfo = debug('packherd:info')
const logDebug = debug('packherd:debug')
const logError = debug('packherd:error')

type LoadInfos = Map<
  string,
  number //  durationMilliSeconds
>

export type Benchmark = {
  time(key: string): void
  timeEnd(key: string, origin: ModuleLoadResult['origin']): void
  write(): void
}

class InactiveBenchmark {
  time(_key: string) {}
  timeEnd(_key: string, _origin: ModuleLoadResult['origin']) {}
  write() {}
}

class ActiveBenchmark {
  private readonly pending: Map<string, number /* start */>
  private readonly packherdExports: LoadInfos
  private readonly packherdDefinitions: LoadInfos
  private readonly moduleLoads: LoadInfos

  constructor(private readonly outputPath: string) {
    this.pending = new Map()
    this.packherdExports = new Map()
    this.packherdDefinitions = new Map()
    this.moduleLoads = new Map()
  }

  time(key: string) {
    const now = getTime()
    this.pending.set(key, now)
  }

  timeEnd(key: string, origin: ModuleLoadResult['origin']) {
    const before = this.pending.get(key)
    assert(before != null, `${key} not added via time()`)

    const now = getTime()
    const delta = now - before
    switch (origin) {
      case 'packherd:export':
        this.packherdExports.set(key, delta)
        break
      case 'packherd:definition':
        this.packherdDefinitions.set(key, delta)
        break
      case 'Module._load':
        this.moduleLoads.set(key, delta)
        break
      default:
        assert.fail(`Not supporting timing ${origin} loads`)
    }

    this.pending.delete(key)
  }

  write() {
    writeFileSync(this.outputPath, this.json(), 'utf8')
  }

  private json() {
    return JSON.stringify(
      {
        packherdExports: Array.from(this.packherdExports),
        packherdDefinitions: Array.from(this.packherdDefinitions),
        moduleLoads: Array.from(this.moduleLoads),
      },
      null,
      2
    )
  }
}

/**
 * Depending on the provided outputPath being defined or not, it xets up
 * an inactive benchmark which does nothing or an active one which
 * collects and writes out data.
 */
export function setupBenchmark(outputPath?: string) {
  if (outputPath == null) return new InactiveBenchmark()
  const benchmark = new ActiveBenchmark(outputPath)

  logDebug('Setting up require stats dump on process exit')
  const dir = path.dirname(outputPath)
  try {
    ensureDirSync(dir)
    process.on('exit', () => {
      benchmark.write()
      logInfo('Wrote require stats to %s', outputPath)
    })
  } catch (err) {
    logError('%s directory does not exist, will not write require stats')
    logError(err)
  }
  return benchmark
}

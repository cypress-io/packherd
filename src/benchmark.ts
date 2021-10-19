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

export type LoadInfo = { duration: number /* MilliSeconds */; stack: string[] }
export type LoadInfos = Map<string, LoadInfo>

export type PersistedLoadInfos = {
  packherdExports: [string, LoadInfo][]
  packherdDefinitions: [string, LoadInfo][]
  moduleLoads: [string, LoadInfo][]
}

/**
 * Exposes an API to interact with the packherd benchmarking tool
 * created via {@link setupBenchmark}.
 *
 * @category Benchmark
 */
export type Benchmark = {
  /**
   * Similar to `console.time` indicates the start of a module load action with given key.
   */
  time(key: string): void
  /**
   * Similar to `console.timeEnd` indicates the completion of a module load action with given key.
   *
   * @param origin indicates how the module was loaded
   * @param stack the stack of modules, parent to child which led to loading this module
   */
  timeEnd(
    key: string,
    origin: ModuleLoadResult['origin'],
    stack: string[]
  ): void
  /**
   * Writes the collected benchmarks to the provided file, see {@link setupBenchmark}.
   */
  write(): void
}

class InactiveBenchmark {
  time(_key: string) {}
  timeEnd(
    _key: string,
    _origin: ModuleLoadResult['origin'],
    _stack: string[]
  ) {}
  write() {}
}

class ActiveBenchmark {
  private readonly pending: Map<string, number /* start */>
  private readonly packherdExports: LoadInfos
  private readonly packherdDefinitions: LoadInfos
  private readonly moduleLoads: LoadInfos

  constructor(
    private readonly projectBaseDir: string,
    private readonly outputPath: string
  ) {
    this.pending = new Map()
    this.packherdExports = new Map()
    this.packherdDefinitions = new Map()
    this.moduleLoads = new Map()
  }

  time(key: string) {
    const now = getTime()
    this.pending.set(key, now)
  }

  timeEnd(key: string, origin: ModuleLoadResult['origin'], stack: string[]) {
    const before = this.pending.get(key)
    assert(before != null, `${key} not added via time()`)

    const now = getTime()
    const duration = now - before
    switch (origin) {
      case 'packherd:export':
        this.packherdExports.set(key, { duration, stack })
        break
      case 'packherd:definition':
        this.packherdDefinitions.set(key, { duration, stack })
        break
      case 'Module._load':
        this.moduleLoads.set(key, { duration, stack })
        break
      default:
        assert.fail(`Not supporting timing ${origin} loads`)
    }

    this.pending.delete(key)
  }

  write() {
    writeFileSync(this.outputPath, this.json(), 'utf8')
  }

  private _fullPath(info: LoadInfo) {
    return {
      ...info,
      stack: info.stack.map((x) => path.resolve(this.projectBaseDir, x)),
    }
  }

  private json() {
    const packherdExports: PersistedLoadInfos['packherdExports'] = []
    const packherdDefinitions: PersistedLoadInfos['packherdDefinitions'] = []
    const moduleLoads: PersistedLoadInfos['moduleLoads'] = []

    for (const [key, info] of this.packherdExports) {
      packherdExports.push([key, this._fullPath(info)])
    }
    for (const [key, info] of this.packherdDefinitions) {
      packherdDefinitions.push([key, this._fullPath(info)])
    }
    for (const [key, info] of this.moduleLoads) {
      moduleLoads.push([key, this._fullPath(info)])
    }

    const loadInfos: PersistedLoadInfos = {
      packherdExports,
      packherdDefinitions,
      moduleLoads,
    }
    return JSON.stringify(loadInfos, null, 2)
  }
}

/**
 * Depending on the provided outputPath being defined or not, it sets up
 * an inactive benchmark which does nothing or an active one which
 * collects and writes out data.
 *
 * Tracks loaded modules, either via exports, definitions or via Node.js
 * and the time it took to load them.
 *
 * @param projectBaseDir root of project
 * @param outputPath optional benchmark output
 *
 * @category Benchmark
 */
export function setupBenchmark(projectBaseDir: string, outputPath?: string) {
  if (outputPath == null) return new InactiveBenchmark()
  const benchmark = new ActiveBenchmark(projectBaseDir, outputPath)

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

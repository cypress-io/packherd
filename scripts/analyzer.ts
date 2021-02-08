import { strict as assert } from 'assert'
import { depStats, modulePackageInfo, PackageInfo } from 'depstats'
import { Metadata } from 'esbuild'
import path from 'path'
import { LoadInfo } from '../src/benchmark'
import { byDurationReversed, threeDecimals } from './utils'

type AnalyzedInfo = {
  package: string
  path: string
  duration: number
  size: string
  children: { path: string; duration: number; size: string }[]
}

export class Analyzer {
  private readonly all: Map<string, LoadInfo>

  constructor(
    allSorted: [key: string, val: LoadInfo][],
    readonly metaData: Metadata & { projectBaseDir: string }
  ) {
    this.all = new Map(allSorted)
  }

  private async importsByParent() {
    const map: Map<string, string[]> = new Map()
    for (const [key, { imports }] of Object.entries(this.metaData.inputs)) {
      map.set(
        path.resolve(this.metaData.projectBaseDir, key),
        imports.map((x) => path.resolve(this.metaData.projectBaseDir, x.path))
      )
    }
    return map
  }

  async analyze() {
    const analyzeds: AnalyzedInfo[] = []
    const imports = await this.importsByParent()
    const packages: Map<string, PackageInfo> = await depStats(
      this.metaData.projectBaseDir,
      Array.from(this.all.keys())
    )

    for (const [key, { duration }] of this.all) {
      analyzeds.push(this._produceParent(key, duration, imports, packages))
    }
    return analyzeds.sort(byDurationReversed).filter((x) => x.duration > 1)
  }

  private _produceParent(
    key: string,
    duration: number,
    imports: Map<string, string[]>,
    packages: Map<string, PackageInfo>
  ): AnalyzedInfo {
    const children = imports.get(key)
    const childrenWithDuration =
      children == null
        ? []
        : children.map((x) => {
            const loadInfo = this.all.get(x)
            const stat = modulePackageInfo(packages, x)
            const duration = loadInfo == null ? 0 : loadInfo.duration
            const size = stat == null ? 'n/a' : stat.mdl.humanSize
            return { path: x, duration, size }
          })

    const stat = modulePackageInfo(packages, key)
    assert(stat != null, `unable to find stat for ${key}`)
    const { pkg, mdl } = stat
    return {
      path: key,
      package: `${pkg.name}@${pkg.version}`,
      duration: threeDecimals(duration),
      size: mdl.humanSize,
      children: childrenWithDuration
        .sort(byDurationReversed)
        .map((x) => ({ ...x, duration: threeDecimals(x.duration) })),
    }
  }
}

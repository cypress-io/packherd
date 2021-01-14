import path from 'path'

import { tmpdir } from 'os'
import { promises as fs } from 'fs'
import { ensureDirSync } from './utils'
import { createBundle } from './create-bundle'
import { Metadata } from 'esbuild'

const packherd = require('../../package.json').name

type PathsMapper = (s: string) => string
const identityMapper: PathsMapper = (s: string) => s

const cwd = process.cwd()

export class EntryGenerator {
  private readonly entryDirectory: string
  constructor(
    readonly entryFile: string,
    readonly nodeModulesOnly: boolean = true,
    readonly pathsMapper: PathsMapper = identityMapper
  ) {
    this.entryDirectory = path.dirname(entryFile)
  }

  async createEntryScript() {
    const meta = await this._getMetadata()
    const relToCwdPaths = this._resolveRelativePaths(meta)
    relToCwdPaths.sort()

    const fullPaths = relToCwdPaths.map((x) => path.join(cwd, x))
    const paths = fullPaths.map((x) => path.relative(this.entryDirectory, x))

    const entry = ['// vim: set ft=text:']
      .concat(paths.map((x) => `exports['${x}'] = require('${x}')`))
      .join('\n')
    return { paths, entry }
  }

  private async _getMetadata(): Promise<Metadata> {
    const bundleTmpDir = path.join(tmpdir(), 'v8-snapshot')
    ensureDirSync(bundleTmpDir)

    const outfile = path.join(bundleTmpDir, 'bundle.js')
    const metafile = path.join(bundleTmpDir, 'meta.json')

    createBundle({ outfile, metafile, entryFilePath: this.entryFile })
    const metaContent = await fs.readFile(metafile, 'utf8')
    return JSON.parse(metaContent)
  }

  private _resolveRelativePaths(meta: Metadata) {
    let relPaths = Object.keys(meta.inputs).filter((x) => !x.includes(packherd))

    if (this.nodeModulesOnly) {
      relPaths = relPaths.filter((x) => x.includes('node_modules'))
    }

    return relPaths
      .map((x) => x.replace(/^node_modules\//, './node_modules/'))
      .map(this.pathsMapper)
  }
}

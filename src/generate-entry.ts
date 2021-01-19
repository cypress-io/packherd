import path from 'path'

import { strict as assert } from 'assert'
import { createBundle } from './create-bundle'
import { Metadata } from 'esbuild'
import { tmpFilePaths } from './utils'

const packherd = require('../../package.json').name

export type PathsMapper = (s: string) => string
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
      .concat(paths.map((x) => `exports['./${x}'] = require('./${x}')`))
      .join('\n')
    return { paths, entry }
  }

  private async _getMetadata(): Promise<Metadata> {
    const { outfile, metafile } = tmpFilePaths()
    const { outputFiles } = await createBundle({
      outfile,
      metafile,
      entryFilePath: this.entryFile,
      outbase: this.entryDirectory,
    })
    assert(outputFiles.length >= 2, 'expecting at least two outfiles')
    return JSON.parse(Buffer.from(outputFiles[1].contents).toString('utf8'))
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

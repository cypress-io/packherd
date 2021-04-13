import path from 'path'

import { Metafile } from 'esbuild'
import { CreateBundle } from './types'
import { getMetadata } from './get-metadata'

const packherd = require('../../package.json').name

export type PathsMapper = (s: string) => string
export const identityMapper: PathsMapper = (s: string) => s

export class EntryGenerator {
  private readonly entryDirectory: string
  constructor(
    private readonly createBundle: CreateBundle,
    private readonly entryFile: string,
    private readonly nodeModulesOnly: boolean = true,
    private readonly pathsMapper: PathsMapper = identityMapper
  ) {
    this.entryDirectory = path.dirname(entryFile)
  }

  async createEntryScript() {
    const meta = await this._getMetadata()
    const relToCwdPaths = this._resolveRelativePaths(meta)
    relToCwdPaths.sort()

    const fullPaths = relToCwdPaths.map((x) => path.join(process.cwd(), x))
    const paths = fullPaths.map((x) => path.relative(this.entryDirectory, x))

    const entry = ['// vim: set ft=text:']
      .concat(paths.map((x) => `exports['./${x}'] = require('./${x}')`))
      .join('\n')
    return { paths, entry }
  }

  private _getMetadata(): Promise<Metafile> {
    return getMetadata(this.createBundle, this.entryFile, this.entryDirectory)
  }

  private _resolveRelativePaths(meta: Metafile) {
    let relPaths = Object.keys(meta.inputs).filter((x) => !x.includes(packherd))

    if (this.nodeModulesOnly) {
      relPaths = relPaths.filter((x) => x.includes('node_modules'))
    }
    return relPaths
      .map((x) => x.replace(/^node_modules\//, './node_modules/'))
      .map(this.pathsMapper)
  }
}

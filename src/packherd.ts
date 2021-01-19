import path from 'path'
import { strict as assert } from 'assert'
import { createBundle } from './create-bundle'
import { EntryGenerator, PathsMapper } from './generate-entry'
import { tmpFilePaths } from './utils'

export type PackherdOpts = {
  entryFile: string
  nodeModulesOnly?: boolean
  pathsMapper?: PathsMapper
}

export async function packherd(opts: PackherdOpts) {
  const entryGenerator = new EntryGenerator(
    opts.entryFile,
    opts.nodeModulesOnly,
    opts.pathsMapper
  )
  const { entry } = await entryGenerator.createEntryScript()

  const { outfile, metafile } = tmpFilePaths()

  const { outputFiles } = await createBundle({
    outdir: path.dirname(outfile),
    metafile,
    entryFilePath: opts.entryFile,
    stdin: {
      contents: entry,
      sourcefile: opts.entryFile,
      resolveDir: path.dirname(opts.entryFile),
    },
  })
  assert(outputFiles.length >= 2, 'expecting at least two outfiles')
  return {
    bundle: Buffer.from(outputFiles[0].contents),
    meta: JSON.parse(Buffer.from(outputFiles[1].contents).toString('utf8')),
  }
}

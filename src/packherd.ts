import path from 'path'
import { strict as assert } from 'assert'
import { createBundle as defaultCreateBundle } from './create-bundle'
import { EntryGenerator, PathsMapper } from './generate-entry'
import { tmpFilePaths } from './utils'
import { CreateBundle } from './types'

export { packherdRequire, PackherdRequireOpts, GetModuleKey } from './require'
export * from './types'

export type PackherdOpts = {
  entryFile: string
  nodeModulesOnly?: boolean
  pathsMapper?: PathsMapper
  createBundle?: CreateBundle
}

export async function packherd(opts: PackherdOpts) {
  const createBundle = opts.createBundle || defaultCreateBundle
  const entryGenerator = new EntryGenerator(
    createBundle,
    opts.entryFile,
    opts.nodeModulesOnly,
    opts.pathsMapper
  )

  const { entry } = await entryGenerator.createEntryScript()
  const { outfile, metafile } = tmpFilePaths()

  const { outputFiles, warnings } = await createBundle({
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
  const [bundleFile, metaFile] = outputFiles

  assert(bundleFile.contents != null, 'bundle output should include contents')
  assert(metaFile.text != null, 'meta output should include text')

  return {
    bundle: bundleFile.contents,
    meta: JSON.parse(metaFile.text),
    warnings,
  }
}

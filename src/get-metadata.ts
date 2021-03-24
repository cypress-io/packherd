import { strict as assert } from 'assert'
import { Metadata } from 'esbuild'
import { CreateBundle } from './types'

export async function getMetadata(
  createBundle: CreateBundle,
  entryFilePath: string,
  outbase: string
): Promise<Metadata> {
  const { outputFiles } = await createBundle({
    metafile: '<stdout:meta>',
    outfile: '<stdout:out>',
    entryFilePath,
    outbase,
  })
  assert(outputFiles.length >= 2, 'expecting at least two outfiles')
  assert(outputFiles[1].text != null, 'meta should include text')
  return JSON.parse(outputFiles[1].text)
}

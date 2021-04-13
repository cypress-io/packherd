import { strict as assert } from 'assert'
import { Metafile } from 'esbuild'
import { CreateBundle } from './types'

export async function getMetadata(
  createBundle: CreateBundle,
  entryFilePath: string,
  outbase: string
): Promise<Metafile> {
  const { metafile } = await createBundle({
    metafile: true,
    outfile: '<stdout:out>',
    entryFilePath,
    outbase,
  })
  assert(metafile != null, 'createBundle should return result with metaFile')
  return metafile
}

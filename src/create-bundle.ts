import { BuildOptions, build } from 'esbuild'
import { CreateBundleOpts, CreateBundleResult } from './types'

const DEFAULT_BUNDLE_OPTS: Partial<CreateBundleOpts> = {
  platform: 'node',
  target: ['node14.5'],
}

export function createBundle(
  args: CreateBundleOpts
): Promise<CreateBundleResult> {
  const opts = Object.assign({}, DEFAULT_BUNDLE_OPTS, args, {
    entryPoints: [args.entryFilePath],
    bundle: true,
    write: false,
  }) as BuildOptions & { write: false }
  // TODO(thlorenz): this is horrible, but esbuild throws if it encounters an unknown opt
  // @ts-ignore
  delete opts.entryFilePath
  return build(opts)
}

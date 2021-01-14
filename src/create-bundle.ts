import { BuildOptions, buildSync } from 'esbuild'

export type CreateBundleOpts = BuildOptions & {
  outfile: string
  metafile: string
  entryFilePath: string
}

const DEFAULT_BUNDLE_OPTS: Partial<CreateBundleOpts> = {
  platform: 'node',
  target: ['node14.5'],
}

export function createBundle(args: CreateBundleOpts) {
  const opts: CreateBundleOpts = Object.assign({}, DEFAULT_BUNDLE_OPTS, args, {
    entryPoints: [args.entryFilePath],
    bundle: true,
  })
  // TODO(thlorenz): this is horrible, but esbuild throws if it encounters an unknown opt
  // @ts-ignore
  delete opts.entryFilePath
  buildSync(opts)
}

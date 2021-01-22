import { BuildOptions, BuildResult, OutputFile } from 'esbuild'

type NodeRequireFunction = (id: string) => any

export type ModuleDefinition = (
  exports: NodeModule['exports'],
  module: { exports: NodeModule['exports'] },
  __filename: string,
  __dirname: string,
  require: NodeRequireFunction
) => NodeModule

export type ModuleResolveResult = {
  resolved: 'module' | 'path'
  fullPath: string
  relPath: string
}

export type ModuleLoadResult = ModuleResolveResult & {
  exports: NodeModule
  origin: 'packherd' | 'Module._load'
}

export type ModuleBuildin = typeof import('module') & {
  _resolveFilename(
    moduleUri: string,
    parent: NodeModule | undefined,
    isMain: boolean
  ): string
  _load(
    request: string,
    parent: NodeModule | undefined,
    isMain: boolean
  ): NodeModule
  _cache: Record<string, NodeModule>
}

export type CreateBundleOpts = BuildOptions & {
  metafile: string
  entryFilePath: string
}

export type CreateBundleOutputFile = Pick<OutputFile, 'text'>
export type CreateBundleResult = {
  warnings: BuildResult['warnings']
  outputFiles: CreateBundleOutputFile[]
}

export type CreateBundle = (
  args: CreateBundleOpts
) => Promise<CreateBundleResult>

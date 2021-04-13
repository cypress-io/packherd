import {
  BuildOptions,
  BuildResult,
  Metafile,
  OutputFile,
  TransformOptions,
} from 'esbuild'

type NodeRequireFunction = (id: string) => any

export type ModuleDefinition = (
  exports: NodeModule['exports'],
  module: { exports: NodeModule['exports'] },
  __filename: string,
  __dirname: string,
  require: NodeRequireFunction
) => NodeModule

export type ModuleResolveResult = {
  resolved: 'module:node' | 'module:tsc' | 'path'
  fullPath: string
  relPath: string
}

export type ModuleLoadResult = ModuleResolveResult & {
  exports: NodeModule
  origin:
    | 'packherd:export'
    | 'packherd:definition'
    | 'packherd:loading'
    | 'Module._cache'
    | 'Module._load'
}

export type ModuleMapper = (
  parent: NodeModule,
  moduleUri: string,
  projectBasedir: string
) => string

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
  entryFilePath: string
}

export type CreateBundleOutputFile = {
  contents: OutputFile['contents']
}

export type CreateBundleResult = {
  warnings: BuildResult['warnings']
  outputFiles: CreateBundleOutputFile[]
  metafile: Metafile
}

export type CreateBundle = (
  args: CreateBundleOpts
) => Promise<CreateBundleResult>

export interface TranspileCache {
  get(fullPath: string): string | undefined
  add(origFullPath: string, convertedContent: string): void
  clearSync(): void
}
export type InitTranspileCache = (
  projectBasedir: string,
  cacheDir?: string
) => TranspileCache | undefined

export type PackherdTranspileOpts = {
  tsconfig?: TransformOptions['tsconfigRaw']
  supportTS?: boolean
  initTranspileCache?: InitTranspileCache
}

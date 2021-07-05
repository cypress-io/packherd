import {
  BuildOptions,
  BuildResult,
  Metafile,
  OutputFile,
  TransformOptions,
} from 'esbuild'

import type { RawSourceMap } from 'source-map-js'

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

export type CreateBundleSourcemap = {
  contents: OutputFile['contents']
}

export type CreateBundleResult = {
  warnings: BuildResult['warnings']
  outputFiles: CreateBundleOutputFile[]
  sourceMap?: CreateBundleSourcemap
  metafile?: Metafile
}

export type CreateBundle = (
  args: CreateBundleOpts
) => Promise<CreateBundleResult>

export interface TranspileCache {
  get(fullPath: string, skipStaleCheck?: boolean): string | undefined
  addAsync(origFullPath: string, convertedContent: string): Promise<void>
  add(origFullPath: string, convertedContent: string): void
  clearSync(): void
}
export type TranspileCacheOpts = {
  cacheDir: string
  keepInMemoryCache: boolean
}
export type InitTranspileCache = (
  projectBasedir: string,
  opts?: Partial<TranspileCacheOpts>
) => TranspileCache | undefined

export type PackherdTranspileOpts = {
  tsconfig?: TransformOptions['tsconfigRaw']
  supportTS?: boolean
  initTranspileCache?: InitTranspileCache
}

export type SourceMapLookup = (uri: string) => RawSourceMap | undefined

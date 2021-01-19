type NodeRequireFunction = (id: string) => any

export type ModuleDefinition = (
  exports: NodeModule['exports'],
  module: { exports: NodeModule['exports'] },
  __filename: string,
  __dirname: string,
  require: NodeRequireFunction
) => NodeModule

export type SnapshotResult = {
  customRequire: {
    cache: Record<string, NodeModule>
    definitions: Record<string, ModuleDefinition>
  }
}

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

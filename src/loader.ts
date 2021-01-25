import debug from 'debug'
import path from 'path'
import { ModuleBuildin, ModuleLoadResult, ModuleResolveResult } from './types'

const logInfo = debug('packherd:info')

export type GetModuleKey = (
  moduleRelativePath: string,
  moduleUri: string
) => string

export type ModuleLoaderOpts = {
  diagnostics?: boolean
  // esbuild default bundler exports objects, however the adapted version for snapshots
  // exports functions ala Node.js wrappers instead
  // TODO(thlorenz): allow both objects and definitions which will be queried, objects first
  exportsObjects: boolean
  getModuleKey?: GetModuleKey
}

const defaultGetModuleKey = (moduleRelativePath: string, _moduleUri: string) =>
  `./${moduleRelativePath}`

export class PackherdModuleLoader {
  hits: number = 0
  misses: number = 0
  private readonly diagnostics: boolean
  private readonly exportsObjects: boolean
  private readonly getModuleKey: GetModuleKey

  constructor(
    private readonly packherdExports: NodeModule['exports'],
    private readonly Module: ModuleBuildin,
    private readonly origLoad: ModuleBuildin['_load'],
    private readonly projectBaseDir: string,
    opts: ModuleLoaderOpts
  ) {
    this.diagnostics = !!opts.diagnostics
    this.exportsObjects = opts.exportsObjects
    this.getModuleKey = opts.getModuleKey || defaultGetModuleKey
  }

  dumpInfo() {
    if (this.diagnostics) {
      logInfo({
        hits: this.hits,
        misses: this.misses,
      })
    }
  }

  resolvePaths(
    moduleUri: string,
    parent: NodeModule,
    isMain: boolean
  ): ModuleResolveResult {
    let fullPath: string
    let resolved: ModuleResolveResult['resolved']
    try {
      fullPath = this.Module._resolveFilename(moduleUri, parent, isMain)
      resolved = 'module'
    } catch (err) {
      fullPath = path.resolve(this.projectBaseDir, moduleUri)
      resolved = 'path'
    }
    const relPath = path.relative(this.projectBaseDir, fullPath)
    return { resolved, fullPath, relPath }
  }

  tryLoad(
    moduleUri: string,
    parent: NodeModule,
    isMain: boolean
  ): ModuleLoadResult {
    let { resolved, fullPath, relPath } = this.resolvePaths(
      moduleUri,
      parent,
      isMain
    )
    const packherdKey = this.getModuleKey(moduleUri, relPath)

    // 1. try to resolve from packherd module
    const exporter = this.packherdExports[packherdKey]
    if (exporter != null) {
      const mod: NodeModule = {
        children: [],
        exports: {},
        filename: fullPath,
        id: fullPath,
        loaded: true,
        parent,
        path: fullPath,
        paths: parent?.paths || [],
        require: this.Module.createRequire(fullPath),
      }
      if (this.exportsObjects) {
        mod.exports = exporter
      } else {
        exporter(
          mod.exports,
          mod,
          fullPath,
          path.dirname(fullPath),
          mod.require
        )
      }
      this.hits++
      this.Module._cache[fullPath] = mod
      this.dumpInfo()
      return {
        resolved,
        origin: 'packherd',
        exports: mod.exports,
        fullPath,
        relPath,
      }
    }

    // 2. If none of the above worked fall back to Node.js loader
    const exports = this.origLoad(moduleUri, parent, isMain)
    this.misses++
    this.dumpInfo()
    return { resolved, origin: 'Module._load', exports, fullPath, relPath }
  }
}

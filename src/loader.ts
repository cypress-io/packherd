import debug from 'debug'
import path from 'path'
import { ModuleBuildin, ModuleLoadResult, ModuleResolveResult } from './types'

const logInfo = debug('packherd:info')

export type ModuleLoaderOpts = {
  diagnostics?: boolean
  // esbuild default bundler exports objects, however the adapted version for snapshots
  // exports functions ala Node.js wrappers instead
  exportsObjects: boolean
}

export class PackherdModuleLoader {
  hits: number = 0
  misses: number = 0
  private readonly diagnostics: boolean
  private readonly exportsObjects: boolean

  constructor(
    private readonly packherdExports: NodeModule['exports'],
    private readonly Module: ModuleBuildin,
    private readonly origLoad: ModuleBuildin['_load'],
    private readonly projectBaseDir: string,
    opts: ModuleLoaderOpts
  ) {
    this.diagnostics = !!opts.diagnostics
    this.exportsObjects = opts.exportsObjects
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
    let relPath: string
    let resolved: ModuleResolveResult['resolved']
    try {
      fullPath = this.Module._resolveFilename(moduleUri, parent, isMain)
      resolved = 'module'
    } catch (err) {
      fullPath = path.resolve(this.projectBaseDir, moduleUri)
      resolved = 'path'
    }
    relPath = path.relative(this.projectBaseDir, fullPath)
    return { resolved, fullPath, relPath }
  }

  tryLoad(
    moduleUri: string,
    parent: NodeModule,
    isMain: boolean
  ): ModuleLoadResult {
    let { resolved, relPath, fullPath } = this.resolvePaths(
      moduleUri,
      parent,
      isMain
    )
    const packherdKey = `./${relPath}`

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
        paths: parent.paths,
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

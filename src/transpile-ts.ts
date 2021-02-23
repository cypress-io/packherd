import type { Debugger } from 'debug'
import { TransformOptions, transformSync } from 'esbuild'
import type { CompileCache, InitCompileCache } from './types'
import fs from 'fs'
import path from 'path'

type EnhancedModule = NodeModule & {
  _extensions: Record<string, (mod: EnhancedModule, filename: string) => void>
  _compile: (code: string, filename: string) => unknown
  _cache: Record<string, NodeModule>
}

const DEFAULT_TRANSFORM_OPTS: TransformOptions = {
  target: ['node14.5'],
  loader: 'ts',
  format: 'cjs',
}

export function transpileTs(
  fullModuleUri: string,
  cache?: CompileCache
): string {
  const cached = (cache != null && cache.get(fullModuleUri)) || null
  if (cached != null) return cached

  const ts = fs.readFileSync(fullModuleUri, 'utf8')
  return transpileTsCode(fullModuleUri, ts, cache)
}

export function transpileTsCode(
  fullModuleUri: string,
  ts: string,
  cache?: CompileCache
): string {
  const cached = (cache != null && cache.get(fullModuleUri)) || null
  if (cached != null) return cached

  const opts = DEFAULT_TRANSFORM_OPTS
  const result = transformSync(ts, opts)
  if (cache != null) {
    cache.add(fullModuleUri, result.code)
  }
  return result.code
}

export function hookTranspileTs(
  Module: EnhancedModule,
  projectBaseDir: string,
  log: Debugger,
  initCompileCache?: InitCompileCache
) {
  const cache =
    initCompileCache == null
      ? undefined
      : initCompileCache(projectBaseDir, '/tmp/cypress-cache')

  const defaultLoader = Module._extensions['.js']
  Module._extensions['.ts'] = function (mod: EnhancedModule, filename: string) {
    const origCompile = mod._compile

    // TODO(thlorenz): this reads the code first before deciding what is already in the cache
    // how can we improve on that, i.e. we'd prefer calling `transpileTs` instead?

    mod._compile = (code: string) => {
      mod._compile = origCompile
      try {
        log('transpiling %s', path.relative(projectBaseDir, filename))

        // console.time(`ts:transpile ${filename}`)
        const transpiled = transpileTsCode(filename, code, cache)
        // console.timeEnd(`ts:transpile ${filename}`)

        const compiled: NodeModule = mod._compile(
          transpiled,
          filename
        ) as NodeModule
        return compiled
      } catch (err) {
        debugger
        return mod._compile(code, filename)
      }
    }
    defaultLoader(mod, filename)
  }
}

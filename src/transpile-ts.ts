import type { Debugger } from 'debug'
import { TransformOptions, transformSync } from 'esbuild'
import type { TranspileCache, InitTranspileCache } from './types'
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
  tsconfig?: TransformOptions['tsconfigRaw'],
  cache?: TranspileCache
): string {
  const cached = (cache != null && cache.get(fullModuleUri)) || null
  if (cached != null) return cached

  const ts = fs.readFileSync(fullModuleUri, 'utf8')
  return transpileTsCode(fullModuleUri, ts, tsconfig, cache)
}

export function transpileTsCode(
  fullModuleUri: string,
  ts: string,
  tsconfig?: TransformOptions['tsconfigRaw'],
  cache?: TranspileCache
): string {
  const cached = (cache != null && cache.get(fullModuleUri)) || null
  if (cached != null) return cached

  const opts = Object.assign({}, DEFAULT_TRANSFORM_OPTS, {
    tsconfigRaw: tsconfig,
  })
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
  initCompileCache?: InitTranspileCache,
  tsconfig?: TransformOptions['tsconfigRaw']
) {
  const cache =
    initCompileCache == null
      ? undefined
      : initCompileCache(projectBaseDir, '/tmp/cypress-cache')

  const defaultLoader = Module._extensions['.js']
  Module._extensions['.ts'] = function (mod: EnhancedModule, filename: string) {
    const origCompile = mod._compile

    // NOTE: I verified that bypassing the laoder to avoid reading `code` that goes unused in case
    // the transpiled version is alreay in the cache does not make a notable difference.
    // Also if we do that naívely we loose the cache checks that Node.js does for us when using the
    // default loader.
    mod._compile = (code: string) => {
      mod._compile = origCompile
      try {
        log('transpiling %s', path.relative(projectBaseDir, filename))

        // console.time(`ts:transpile ${filename}`)
        const transpiled = transpileTsCode(filename, code, tsconfig, cache)
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

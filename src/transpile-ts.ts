import type { Debugger } from 'debug'
import { TransformOptions, transformSync } from 'esbuild'
import type { TranspileCache, InitTranspileCache } from './types'
import fs from 'fs'
import path from 'path'
import { installSourcemapSupport } from './sourcemap-support'

type EnhancedModule = NodeModule & {
  _extensions: Record<string, (mod: EnhancedModule, filename: string) => void>
  _compile: (code: string, filename: string) => unknown
  _cache: Record<string, NodeModule>
}

const DEFAULT_TRANSFORM_OPTS: TransformOptions = {
  target: ['node14.5'],
  loader: 'ts',
  format: 'cjs',
  sourcemap: 'inline',
  minify: false,
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
  if (cache != null) {
    installSourcemapSupport(cache)
  }

  const cached = (cache != null && cache.get(fullModuleUri)) || null
  if (cached != null) return cached

  const opts = Object.assign({}, DEFAULT_TRANSFORM_OPTS, {
    tsconfigRaw: tsconfig,
    sourcefile: fullModuleUri,
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
  diagnostics: boolean,
  initCompileCache?: InitTranspileCache,
  tsconfig?: TransformOptions['tsconfigRaw']
) {
  const cache =
    initCompileCache == null
      ? undefined
      : initCompileCache(projectBaseDir, { cacheDir: '/tmp/packherd-cache' })

  // If there is no cache we wouldn't know where to store the transpiled JavaScript and thus
  // would have to transpile again just to generate sourcemaps.
  // In general we expect that during development when sourcemaps are desired for on
  // the fly transpiled code, then a cache is used as well.
  if (cache != null) {
    installSourcemapSupport(cache)
  }

  const defaultLoader = Module._extensions['.js']
  Module._extensions['.ts'] = function (mod: EnhancedModule, filename: string) {
    const origCompile = mod._compile

    // NOTE: I benchmarked that bypassing the laoder to avoid reading `code`
    // that goes unused in case the transpiled version is already in the cache.
    // That optimiziation does not make a notable difference and thus we opt of
    // the more robust approach of using the Node.js builtin compile which also
    // provides internal Node.js cache checks.
    mod._compile = (code: string) => {
      mod._compile = origCompile
      try {
        log('transpiling %s', path.relative(projectBaseDir, filename))

        const transpiled = transpileTsCode(filename, code, tsconfig, cache)

        const compiled: NodeModule = mod._compile(
          transpiled,
          filename
        ) as NodeModule
        return compiled
      } catch (err) {
        console.error(err)
        if (diagnostics) {
          debugger
        }
        return mod._compile(code, filename)
      }
    }
    defaultLoader(mod, filename)
  }
}

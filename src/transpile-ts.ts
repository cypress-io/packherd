import type { Debugger } from 'debug'
import { TransformOptions, transformSync } from 'esbuild'
import type { TranspileCache, SourceMapLookup } from './types'
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
  cache: TranspileCache,
  projectBaseDir: string,
  sourceMapLookup?: SourceMapLookup,
  tsconfig?: TransformOptions['tsconfigRaw']
): string {
  const cached = (cache != null && cache.get(fullModuleUri)) || null
  if (cached != null) return cached

  const ts = fs.readFileSync(fullModuleUri, 'utf8')
  return transpileTsCode(
    fullModuleUri,
    ts,
    cache,
    projectBaseDir,
    sourceMapLookup,
    tsconfig
  )
}

export function transpileTsCode(
  fullModuleUri: string,
  ts: string,
  cache: TranspileCache,
  projectBaseDir: string,
  sourceMapLookup?: SourceMapLookup,
  // TODO: consider 'error' for importsNotUsedAsValues (maybe) to add some type checking
  tsconfig?: TransformOptions['tsconfigRaw']
): string {
  installSourcemapSupport(cache, projectBaseDir, sourceMapLookup)

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
  cache: TranspileCache,
  sourceMapLookup?: SourceMapLookup,
  tsconfig?: TransformOptions['tsconfigRaw']
) {
  installSourcemapSupport(cache, projectBaseDir, sourceMapLookup)

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

        const transpiled = transpileTsCode(
          filename,
          code,
          cache,
          projectBaseDir,
          sourceMapLookup,
          tsconfig
        )

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

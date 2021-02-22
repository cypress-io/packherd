import type { Debugger } from 'debug'
import { TransformOptions, transformSync } from 'esbuild'
import { DirtSimpleFileCache } from 'dirt-simple-file-cache'
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
  cache: DirtSimpleFileCache
): string {
  const cached = cache.get(fullModuleUri)
  if (cached != null) return cached

  const ts = fs.readFileSync(fullModuleUri, 'utf8')
  return transpileTsCode(fullModuleUri, cache, ts)
}

export function transpileTsCode(
  fullModuleUri: string,
  cache: DirtSimpleFileCache,
  ts: string
): string {
  const cached = cache.get(fullModuleUri)
  if (cached != null) return cached

  const opts = DEFAULT_TRANSFORM_OPTS
  const result = transformSync(ts, opts)
  cache.add(fullModuleUri, result.code)
  return result.code
}

export function hookTranspileTs(
  Module: EnhancedModule,
  projectBaseDir: string,
  log: Debugger
) {
  const cache = DirtSimpleFileCache.initSync(projectBaseDir)

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
        const transpiled = transpileTsCode(filename, cache, code)
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

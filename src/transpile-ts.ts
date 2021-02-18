import type { Debugger } from 'debug'
import { TransformOptions, transformSync } from 'esbuild'
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

export function transpileTs(fullModuleUri: string): string {
  const ts = fs.readFileSync(fullModuleUri, 'utf8')
  return transpileTsCode(ts)
}

export function transpileTsCode(ts: string): string {
  const opts = DEFAULT_TRANSFORM_OPTS
  const result = transformSync(ts, opts)
  return result.code
}

export function hookTranspileTs(
  Module: EnhancedModule,
  projectBaseDir: string,
  log: Debugger
) {
  const defaultLoader = Module._extensions['.js']
  Module._extensions['.ts'] = function (mod: EnhancedModule, filename: string) {
    const origCompile = mod._compile
    mod._compile = (code: string) => {
      mod._compile = origCompile
      try {
        log('transpiling %s', path.relative(projectBaseDir, filename))

        // console.time(`ts:transpile ${filename}`)
        const transpiled = transpileTsCode(code)
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

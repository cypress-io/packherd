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
  let code = result.code

  // __export(exports, {
  const exportResolution = /__export\(exports,/.test(code)
    ? `
for (const key in exports) {
  const fn = exports[key]
  if (typeof fn === 'function') {
    exports[key] = fn()
  } else {
    exports[key] = fn
  }
}
`
    : ''

  code = code
    .replace(/var __toModule/, 'var __orig_toModule')
    .replace(/var __export/, 'var __orig__export')

  code = `${code}
function __export(target, fns) {
  for (const key in fns) {
    try {
      target[key] = fns[key]
    } catch (err) {
      debugger
    }
  }
}
${exportResolution}

function reExport(target, mdl) {
  if ((mdl && typeof mdl === 'object') || typeof mdl === 'function') {
    for (let key of __getOwnPropNames(mdl))
      if (!__hasOwnProp.call(target, key) && key !== 'default') {
        __defProp(target, key, {
          get: () => mdl[key],
          enumerable: !(desc = __getOwnPropDesc(mdl, key)) || desc.enumerable,
        })
      }
  }
  return target
}

function __toModule(mdl) {
  const def = mdl != null ? mdl : {}
  if (!('default' in def)) {
    def.default = mdl
  }
  const marked = def.__esModule ? def : __markAsModule(def)

  const reExported = reExport(marked, mdl)
  return reExported
}
`
  if (cache != null) {
    cache.add(fullModuleUri, code)
  }

  return code
}

// @ts-ignore
function makeStubable() {
  for (const key of exports) {
    exports[key] = exports[key]
  }
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

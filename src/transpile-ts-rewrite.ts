import { strict as assert } from 'assert'

const exportStartRx = /^__export\(exports, {/
const exportEndRx = /^}\);$/
const exportAssignRx = /([^:]+): ?\(\) ?=> ?([^,]+),?$/

export function rewriteExports(code: string): string {
  const lines = code.split('\n')
  const exportProps: Record<string, string> = {}

  let startIdx = 0
  while (!exportStartRx.test(lines[startIdx]) && startIdx < lines.length)
    startIdx++
  if (startIdx == lines.length) return code

  let endIdx
  for (endIdx = startIdx + 1; endIdx < lines.length; endIdx++) {
    const line = lines[endIdx]
    if (exportEndRx.test(line)) break
    const match = line.match(exportAssignRx)
    assert(match != null, `${line} should have contained an export assignment`)
    exportProps[match[1]] = match[2]
  }

  const adaptedLines = lines.slice(0, startIdx)

  // -----------------
  // module.exports resolve function
  // -----------------
  // Ensure we include the exports rewrite in the same location in order to not
  // invalidate sourcemaps
  const exportPropsStr = Object.entries(exportProps).map(
    ([key, val]) => `${key}: ${val}`
  )
  adaptedLines.push('const __getModuleExports = () => ({ __esModule: true,')
  for (const exp of exportPropsStr) {
    adaptedLines.push(`${exp},`)
  }
  adaptedLines.push('})')

  // -----------------
  // User code
  // -----------------
  for (let j = endIdx + 1; j < lines.length; j++) {
    adaptedLines.push(lines[j])
  }

  // We have to resolve module.exports at the bottom to make sure all props resolved in
  // it have been defined at this point
  const adaptedTop = adaptedLines.join('\n')
  let adaptedCode = `${adaptedTop};module.exports = __getModuleExports()`.replace(
    /var __toModule/,
    'var __orig_toModule'
  )

  return `${adaptedCode}
function __toModule(mdl) {
  const target = mdl ?? {}
  if (!('default' in target)) {
    __defProp(
      target,
      'default',
      mdl && mdl.__esModule && 'default' in mdl
        ? { get: () => target.default,
            set: (val) => target.default = val,
            enumerable: true }
        : { value: mdl, 
            writable: true,
            enumerable: true }
    )
  }
  __markAsModule(target)
  return target
}
`
}

/*
function _scratch() {
  __defProp(
    mdl != null ? __create(__getProtoOf(mdl)) : {},
    'default',
    mdl && mdl.__esModule && 'default' in mdl
      ? { get: () => mdl.default, enumerable: true }
      : { value: mdl, enumerable: true }
  )
}
*/

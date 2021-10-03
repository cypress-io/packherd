import { strict as assert } from 'assert'

const exportStartRx = /^__export\(exports, {/
const exportEndRx = /^}\);$/
const exportAssignRx = /([^:]+): ?\(\) ?=> ?([^,]+),?$/

export function rewriteExports(code: string): string {
  const lines = code.split('\n')
  const exportProps: Record<string, string> = {}

  let startIdx = 0
  while (!exportStartRx.test(lines[startIdx]) && startIdx < lines.length) {
    startIdx++
  }

  let adaptedLines
  // some modules, like tests have not exports
  let replacingExports = startIdx < lines.length
  if (replacingExports) {
    let endIdx
    for (endIdx = startIdx + 1; endIdx < lines.length; endIdx++) {
      const line = lines[endIdx]
      if (exportEndRx.test(line)) break
      const match = line.match(exportAssignRx)
      assert(
        match != null,
        `${line} should have contained an export assignment`
      )
      exportProps[match[1].trim()] = match[2]
    }

    adaptedLines = lines.slice(0, startIdx)

    // -----------------
    // module.exports preparation
    // -----------------
    // We include the exported properties as `getters` on top of imports in order to
    // facilitate early access due to circular imports
    const exportDefineProp = Object.entries(exportProps).map(([key, val]) => {
      return `Object.defineProperty(exports, '${key}', { get() { return ${val} }, enumerable: true, configurable: true })`
    })

    // At the bottom of the file we overwrite `module.exports` again to be an
    // `commonJS` compatible Object literal
    const exportDirect = Object.entries(exportProps).map(
      ([key, val]) => `${key}: ${val}`
    )

    // -----------------
    // module.exports getters
    // -----------------
    for (const exp of exportDefineProp) {
      adaptedLines.push(`${exp}`)
    }

    // -----------------
    // User code
    // -----------------
    for (let j = endIdx + 1; j < lines.length; j++) {
      adaptedLines.push(lines[j])
    }

    // -----------------
    // module.exports literal
    // -----------------
    adaptedLines.push('module.exports = Object.assign({}, {')
    for (const exp of exportDirect) {
      adaptedLines.push(`${exp},`)
    }
    adaptedLines.push('}, exports)')
  } else {
    // no exports, thus we leave the code up to here unchanged
    adaptedLines = lines
  }

  const adaptedTop = adaptedLines.join('\n')

  let adaptedCode = adaptedTop
    // TODO: would be more efficient to perform the replace on the particular line
    .replace(/var __toModule/, 'var __orig_toModule')

  return `${adaptedCode}
function __toModule(mdl) {
  const target = mdl ?? {}
  if (!Object.hasOwnProperty.call(mdl, 'default')) {
    __defProp(
      target,
      'default',
      mdl && mdl.__esModule && Object.hasOwnProperty.call(mdl, 'default')
        ? { get: () => target.default,
            set: (val) => target.default = val,
            enumerable: true }
        : { value: mdl, 
            writable: true,
            enumerable: true }
    )
  }
  if (!('__esModule' in target)) {
    __markAsModule(target)
  }
  return target
}
`
}

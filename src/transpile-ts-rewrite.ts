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
  for (let j = endIdx + 1; j < lines.length; j++) {
    adaptedLines.push(lines[j])
  }

  const exportPropsStr = Object.entries(exportProps)
    .map(([key, val]) => `${key}: ${val}`)
    .join(',\n  ')
  return `${adaptedLines.join('\n')}
module.exports = {
  ${exportPropsStr}
}
`
}

import debug from 'debug'
import path from 'path'
import { MappedPosition, RawSourceMap, SourceMapConsumer } from 'source-map-js'
import { TranspileCache } from './types'
import convertSourceMap from 'convert-source-map'

const logError = debug('packherd:error')
const logTrace = debug('packherd:trace')

// -----------------
// types
// -----------------
type StackPosition = {
  nextPos?: MappedPosition
  curPos?: MappedPosition
}
type FullScriptPath = string
type SourcePosition = {
  script: FullScriptPath
  line: number
  column: number
}
type UrlAndMap = { url: string | null; map: SourceMapConsumer | null }
const EMPTY_URL_AND_MAP = { url: null, map: null }

type CallSite = NodeJS.CallSite & { [index: string]: Function }

// -----------------
// Config
// -----------------

// Fix position in Node where some (internal) code is prepended.
// See https://github.com/evanw/node-source-map-support/issues/36
// Header removed in node at ^10.16 || >=11.11.0
// v11 is not an LTS candidate, we can just test the one version with it.
// Test node versions for: 10.16-19, 10.20+, 12-19, 20-99, 100+, or 11.11
const noHeader = /^v(10\.1[6-9]|10\.[2-9][0-9]|10\.[0-9]{3,}|1[2-9]\d*|[2-9]\d|\d{3,}|11\.11)/
const headerLength = noHeader.test(process.version) ? 0 : 62

let sourcemapSupport: SourcemapSupport | undefined

// -----------------
// Install
// -----------------
export function installSourcemapSupport(cache: TranspileCache) {
  if (sourcemapSupport?.prepareStackTrace === Error.prepareStackTrace) return
  sourcemapSupport = new SourcemapSupport(cache)
  Error.prepareStackTrace = sourcemapSupport.prepareStackTrace
}

// -----------------
// SourcemapSupport
// -----------------
class SourcemapSupport {
  private readonly _sourcemapCache: Map<FullScriptPath, UrlAndMap> = new Map()
  constructor(private readonly _cache: TranspileCache) {}

  // This function is part of the V8 stack trace API, for more info see:
  // https://v8.dev/docs/stack-trace-api
  prepareStackTrace = (err: Error, stack: NodeJS.CallSite[]) => {
    const name = err.name ?? 'Error'
    const message = err.message ?? ''
    const errorString = name + ': ' + message

    const state: StackPosition = {}

    const processedStack = []
    for (let i = stack.length - 1; i >= 0; i--) {
      processedStack.push(
        '\n    at ' + this.wrapCallSite(stack[i] as CallSite, state)
      )
      state.nextPos = state.curPos
    }
    state.curPos = state.nextPos = undefined
    return errorString + processedStack.reverse().join('')
  }

  wrapCallSite(frame: CallSite, state: StackPosition): CallSite {
    const script = frame.getFileName()
    if (script != null) {
      const line = frame.getLineNumber()
      let column = frame.getColumnNumber() ?? 1 - 1

      if (line === 1 && column > headerLength && !frame.isEval()) {
        column -= headerLength
      }

      // Special case which is impossible to map to anything
      if (line == null) return frame

      const pos = this.mapSourcePosition({ script, line, column })
      state.curPos = pos
      frame = cloneCallSite(frame)

      const originalFunctionName = frame.getFunctionName

      frame.getFunctionName = function () {
        if (state.nextPos == null) {
          return originalFunctionName()
        }
        return state.nextPos.name ?? originalFunctionName()
      }
      frame.getFileName = function getFileName() {
        return pos.source
      }
      frame.getLineNumber = function getLineNumber() {
        return pos.line
      }
      frame.getColumnNumber = function getColumnNumber() {
        return pos.column + 1
      }
      frame.getScriptNameOrSourceURL = function getScriptNameOrSourceURL() {
        return pos.source
      }
      return frame
    }

    return frame
  }

  mapSourcePosition(pos: SourcePosition): MappedPosition {
    const sourceMap = this.retrieveSourceMap(pos.script)

    if (typeof sourceMap?.map?.originalPositionFor === 'function') {
      const origPos = sourceMap.map.originalPositionFor(pos)

      if (origPos.source != null) return origPos
    }
    // return generated position if we couldn't find the original
    const { line, column, script } = pos
    return {
      line,
      column,
      source: '',
      name: script,
    }
  }

  mapFromInlined(script: string): UrlAndMap {
    const scriptSource = this._cache.get(script)
    if (scriptSource == null) return EMPTY_URL_AND_MAP

    try {
      const converter = convertSourceMap.fromSource(scriptSource)
      if (converter == null) return EMPTY_URL_AND_MAP

      const map: RawSourceMap = converter.sourcemap
      const urlAndMap = { url: script, map: new SourceMapConsumer(map) }
      this._sourcemapCache.set(script, urlAndMap)
      return urlAndMap
    } catch (err) {
      logError('Encountered invalid source map %s', script)
      logError(err)
      return EMPTY_URL_AND_MAP
    }
  }

  retrieveSourceMap(script: FullScriptPath) {
    // Only supporting our own TypeScript modules for now
    if (path.extname(script) !== '.ts') return EMPTY_URL_AND_MAP

    logTrace('retrieving sourcemap for  %s', script)
    const fromMemory = this._sourcemapCache.get(script)
    if (fromMemory != null) {
      logTrace('from memory sourcemap for  %s', script)
      return fromMemory
    }

    return this.mapFromInlined(script)
  }
}

// -----------------
// Utility Methods
// -----------------
//

function cloneCallSite(frame: CallSite): CallSite {
  const clone: Partial<CallSite> = {}
  for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(frame))) {
    clone[name] = /^(?:is|get)/.test(name)
      ? function () {
          return frame[name].call(frame)
        }
      : frame[name]
  }
  clone.toString = CallSiteToString
  return clone as CallSite
}

// Via source-map-support module
// This is copied almost verbatim from the V8 source code at
// https://code.google.com/p/v8/source/browse/trunk/src/messages.js. The
// implementation of wrapCallSite() used to just forward to the actual source
// code of CallSite.prototype.toString but unfortunately a new release of V8
// did something to the prototype chain and broke the shim. The only fix I
// could find was copy/paste.
function CallSiteToString(this: CallSite) {
  let fileName: string | undefined
  let fileLocation: string | undefined = ''
  if (this.isNative()) {
    fileLocation = 'native'
  } else {
    // TODO(thlorenz): may not be needed as this is for in browser callsites
    // @ts-ignore getScriptNameOrSourceURL exists only in the browser
    fileName = this.getScriptNameOrSourceURL()
    if (fileName == null && this.isEval()) {
      fileLocation = this.getEvalOrigin()
      fileLocation += ', ' // Expecting source position to follow.
    }

    if (fileName) {
      fileLocation += fileName
    } else {
      // Source code does not originate from a file and is not native, but we
      // can still get the source position inside the source string, e.g. in
      // an eval string.
      fileLocation += '<anonymous>'
    }
    const lineNumber = this.getLineNumber()
    if (lineNumber != null) {
      fileLocation += ':' + lineNumber
      var columnNumber = this.getColumnNumber()
      if (columnNumber) {
        fileLocation += ':' + columnNumber
      }
    }
  }

  let line = ''
  let addSuffix = true
  const functionName = this.getFunctionName()
  const isConstructor = this.isConstructor()
  const isMethodCall = !(this.isToplevel() || isConstructor)
  if (isMethodCall) {
    let typeName = this.getTypeName()
    // Fixes shim to be backward compatable with Node v0 to v4
    if (typeName === '[object Object]') {
      typeName = 'null'
    }
    const methodName = this.getMethodName()
    if (functionName) {
      if (typeName && functionName.indexOf(typeName) != 0) {
        line += typeName + '.'
      }
      line += functionName
      if (
        methodName &&
        functionName.indexOf('.' + methodName) !=
          functionName.length - methodName.length - 1
      ) {
        line += ' [as ' + methodName + ']'
      }
    } else {
      line += typeName + '.' + (methodName || '<anonymous>')
    }
  } else if (isConstructor) {
    line += 'new ' + (functionName || '<anonymous>')
  } else if (functionName) {
    line += functionName
  } else {
    line += fileLocation
    addSuffix = false
  }
  if (addSuffix) {
    line += ' (' + fileLocation + ')'
  }
  return line
}

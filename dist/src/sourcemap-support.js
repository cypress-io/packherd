"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installSourcemapSupport = exports.getSourceMapAndContent = exports.getSourceMap = void 0;
const debug_1 = __importDefault(require("debug"));
const path_1 = __importDefault(require("path"));
const source_map_js_1 = require("source-map-js");
const convert_source_map_1 = __importDefault(require("convert-source-map"));
const default_transpile_cache_1 = require("./default-transpile-cache");
const logError = (0, debug_1.default)('packherd:error');
const logDebug = (0, debug_1.default)('packherd:debug');
const logTrace = (0, debug_1.default)('packherd:trace');
const INCLUDE_CODE_BEFORE = 2;
const INCLUDE_CODE_AFTER = 2;
const CODE_FRAME_LINE_GUTTER_WIDTH = 4;
const INCLUDE_CODE_FRAMES = process.env.PACKHERD_CODE_FRAMES != null;
const EMPTY_URL_AND_MAP = { url: null, map: null };
// -----------------
// Config
// -----------------
// Fix position in Node where some (internal) code is prepended.
// See https://github.com/evanw/node-source-map-support/issues/36
// Header removed in node at ^10.16 || >=11.11.0
// v11 is not an LTS candidate, we can just test the one version with it.
// Test node versions for: 10.16-19, 10.20+, 12-19, 20-99, 100+, or 11.11
const noHeader = /^v(10\.1[6-9]|10\.[2-9][0-9]|10\.[0-9]{3,}|1[2-9]\d*|[2-9]\d|\d{3,}|11\.11)/;
const headerLength = noHeader.test(process.version) ? 0 : 62;
// -----------------
// Expose uri to map + content mapping
// -----------------
/**
 * Retrieves the sourcemap for the provided bundle uri via the sourcemap support instance.
 *
 * @param projectBaseDir the root of the project for which the bundled code was generated
 * @param bundleUri the path of the generated bundle
 * @param cache when provided will be used to look for sourcemaps from transpiled modules
 * @param sourceMapLookup when provided will be queried to lookup sourcemaps
 */
function getSourceMap(projectBaseDir, bundleUri, cache = new default_transpile_cache_1.DefaultTranspileCache(), sourceMapLookup) {
    const sourcemapSupport = SourcemapSupport.createSingletonInstance(cache, projectBaseDir, sourceMapLookup);
    return sourcemapSupport.retrieveSourceMap(bundleUri);
}
exports.getSourceMap = getSourceMap;
/**
 * Retrieves the sourcemap for the provided bundle uri via the sourcemap support instance
 * and extracts the source of the specified @see fileUri when found.
 *
 * @param projectBaseDir the root of the project for which the bundled code was generated
 * @param bundleUri the path of the generated bundle
 * @param fileUri the path for the original file we want to extract the source content for
 * @param cache when provided will be used to look for sourcemaps from transpiled modules
 * @param sourceMapLookup when provided will be queried to lookup sourcemaps
 */
function getSourceMapAndContent(projectBaseDir, bundleUri, fileUri, cache = new default_transpile_cache_1.DefaultTranspileCache(), sourceMapLookup) {
    const { map, url } = getSourceMap(projectBaseDir, bundleUri, cache, sourceMapLookup);
    if (map == null || url == null)
        return undefined;
    const sourceContent = map.sourceContentFor(fileUri, true);
    return { map, url, sourceContent };
}
exports.getSourceMapAndContent = getSourceMapAndContent;
// -----------------
// Install
// -----------------
/**
 * Creates an instance of @see SourcemapSupport and installs a hook for
 * @see Error.prepareStackTrace in order to map stack traces using the source maps
 * it discovers.
 *
 * @param cache used to look up script content from which to extract source maps
 * @param projectBaseDir directory that is the root of relative source map sources
 * @param sourceMapLookup: when provided is queried for source maps for a particular URI first
 */
function installSourcemapSupport(cache, projectBaseDir, sourceMapLookup) {
    // NOTE: this is a noop if an instance was created previously
    const sourcemapSupport = SourcemapSupport.createSingletonInstance(cache, projectBaseDir, sourceMapLookup);
    if (Error.prepareStackTrace === sourcemapSupport.prepareStackTrace)
        return;
    logDebug('Installing sourcemap');
    Error.prepareStackTrace = sourcemapSupport.prepareStackTrace;
}
exports.installSourcemapSupport = installSourcemapSupport;
// -----------------
// SourcemapSupport
// -----------------
class SourcemapSupport {
    constructor(_cache, _projectBaseDir, _sourceMapLookup) {
        this._cache = _cache;
        this._projectBaseDir = _projectBaseDir;
        this._sourceMapLookup = _sourceMapLookup;
        this._sourcemapCache = new Map();
        // This function is part of the V8 stack trace API, for more info see:
        // https://v8.dev/docs/stack-trace-api
        this.prepareStackTrace = (err, stack) => {
            var _a, _b;
            const name = (_a = err.name) !== null && _a !== void 0 ? _a : 'Error';
            const message = (_b = err.message) !== null && _b !== void 0 ? _b : '';
            const errorString = name + ': ' + message;
            const state = {};
            const processedStack = [];
            let includeCodeFrames = INCLUDE_CODE_FRAMES;
            for (let i = stack.length - 1; i >= 0; i--) {
                const c = this.wrapCallSite(stack[i], state, includeCodeFrames);
                if (includeCodeFrames) {
                    // Keep trying to include some code until we succeeded once
                    includeCodeFrames = c.codeFrames.length === 0;
                }
                if (c.codeFrames != null) {
                    for (const codeFrame of c.codeFrames.reverse()) {
                        processedStack.push(`\n      ${codeFrame}`);
                    }
                }
                processedStack.push('\n    at ' + c);
                state.nextPos = state.curPos;
            }
            state.curPos = state.nextPos = undefined;
            return errorString + processedStack.reverse().join('');
        };
    }
    wrapCallSite(frame, state, includeCodeFrames) {
        var _a;
        const script = frame.getFileName();
        if (script != null) {
            const line = frame.getLineNumber();
            let column = (_a = frame.getColumnNumber()) !== null && _a !== void 0 ? _a : 1 - 1;
            if (line === 1 && column > headerLength && !frame.isEval()) {
                column -= headerLength;
            }
            // Special case which is impossible to map to anything
            if (line == null)
                return frame;
            const pos = this.mapSourcePosition({ script, line, column }, includeCodeFrames);
            state.curPos = pos;
            frame = cloneCallSite(frame);
            const originalFunctionName = frame.getFunctionName;
            frame.getFunctionName = function () {
                var _a;
                if (state.nextPos == null) {
                    return originalFunctionName();
                }
                return (_a = state.nextPos.name) !== null && _a !== void 0 ? _a : originalFunctionName();
            };
            frame.getFileName = function getFileName() {
                return pos.source;
            };
            frame.getLineNumber = function getLineNumber() {
                return pos.line;
            };
            frame.getColumnNumber = function getColumnNumber() {
                return pos.column + 1;
            };
            frame.getScriptNameOrSourceURL = function getScriptNameOrSourceURL() {
                return pos.source;
            };
            frame.codeFrames = pos.codeFrames;
            return frame;
        }
        return frame;
    }
    mapSourcePosition(pos, includeCodeFrames) {
        var _a;
        const sourceMap = this.retrieveSourceMap(pos.script);
        if (typeof ((_a = sourceMap === null || sourceMap === void 0 ? void 0 : sourceMap.map) === null || _a === void 0 ? void 0 : _a.originalPositionFor) === 'function') {
            const origPos = sourceMap.map.originalPositionFor(pos);
            // Sourcemap lines are 0 based so we adjust them to be 1 based to print correct stack frames
            origPos.line++;
            const codeFrames = includeCodeFrames
                ? extractCodeFrames(sourceMap.map, origPos)
                : [];
            if (origPos.source != null) {
                origPos.source = this._ensureFullPath(origPos.source);
                return Object.assign(origPos, { codeFrames });
            }
        }
        // return generated position if we couldn't find the original
        const { line, column, script } = pos;
        return {
            line,
            column,
            source: '',
            name: script,
            codeFrames: [],
        };
    }
    mapFromInlined(script) {
        const scriptSource = this._cache.get(script);
        if (scriptSource == null)
            return EMPTY_URL_AND_MAP;
        try {
            const converter = convert_source_map_1.default.fromSource(scriptSource);
            if (converter == null)
                return EMPTY_URL_AND_MAP;
            const map = converter.sourcemap;
            const urlAndMap = { url: script, map: new source_map_js_1.SourceMapConsumer(map) };
            this._sourcemapCache.set(script, urlAndMap);
            return urlAndMap;
        }
        catch (err) {
            logError('Encountered invalid source map %s', script);
            logError(err);
            return EMPTY_URL_AND_MAP;
        }
    }
    retrieveSourceMap(script) {
        // 1. Try to load previosuly cached source map
        const fromMemory = this._sourcemapCache.get(script);
        if (fromMemory != null) {
            logTrace('from memory sourcemap for "%s"', script);
            return fromMemory;
        }
        // 2. Try to look it up via externally provided function
        if (this._sourceMapLookup != null) {
            const map = this._sourceMapLookup(script);
            try {
                if (map != null) {
                    const urlAndMap = { url: script, map: new source_map_js_1.SourceMapConsumer(map) };
                    this._sourcemapCache.set(script, urlAndMap);
                    logTrace('Retrieved sourcemap for "%s" from sourcemap lookup', script);
                    return urlAndMap;
                }
            }
            catch (err) {
                logError('Looked up invalid source map "%s"', script);
                logError(err);
                return EMPTY_URL_AND_MAP;
            }
        }
        // 3. Try to parse a source map out of the script
        // Only supporting our own TypeScript modules for now
        if (path_1.default.extname(script) !== '.ts')
            return EMPTY_URL_AND_MAP;
        logTrace('retrieving sourcemap for  %s', script);
        return this.mapFromInlined(script);
    }
    _ensureFullPath(p) {
        return path_1.default.isAbsolute(p) ? p : path_1.default.join(this._projectBaseDir, p);
    }
    /**
     * Creates a [SourcmapSupport] instance unless one was created previously.
     * NOTE: that it is impossible for a process to have two instances and the
     * parameters the first one was created with will remain active for the process lifetime.
     */
    static createSingletonInstance(cache, projectBaseDir, sourceMapLookup) {
        if (SourcemapSupport._instance == null) {
            SourcemapSupport._instance = new SourcemapSupport(cache, projectBaseDir, sourceMapLookup);
        }
        return SourcemapSupport._instance;
    }
}
// -----------------
// Utility Methods
// -----------------
//
function cloneCallSite(frame) {
    const clone = {};
    for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(frame))) {
        clone[name] = /^(?:is|get)/.test(name)
            ? function () {
                return frame[name].call(frame);
            }
            : frame[name];
    }
    clone.toString = CallSiteToString;
    return clone;
}
// Via source-map-support module
// This is copied almost verbatim from the V8 source code at
// https://code.google.com/p/v8/source/browse/trunk/src/messages.js. The
// implementation of wrapCallSite() used to just forward to the actual source
// code of CallSite.prototype.toString but unfortunately a new release of V8
// did something to the prototype chain and broke the shim. The only fix I
// could find was copy/paste.
function CallSiteToString() {
    let fileName;
    let fileLocation = '';
    if (this.isNative()) {
        fileLocation = 'native';
    }
    else {
        // TODO(thlorenz): may not be needed as this is for in browser callsites
        // @ts-ignore getScriptNameOrSourceURL exists only in the browser
        fileName = this.getScriptNameOrSourceURL();
        if (fileName == null && this.isEval()) {
            fileLocation = this.getEvalOrigin();
            fileLocation += ', '; // Expecting source position to follow.
        }
        if (fileName) {
            fileLocation += fileName;
        }
        else {
            // Source code does not originate from a file and is not native, but we
            // can still get the source position inside the source string, e.g. in
            // an eval string.
            fileLocation += '<anonymous>';
        }
        const lineNumber = this.getLineNumber();
        if (lineNumber != null) {
            fileLocation += ':' + lineNumber;
            var columnNumber = this.getColumnNumber();
            if (columnNumber) {
                fileLocation += ':' + columnNumber;
            }
        }
    }
    let line = '';
    let addSuffix = true;
    const functionName = this.getFunctionName();
    const isConstructor = this.isConstructor();
    const isMethodCall = !(this.isToplevel() || isConstructor);
    if (isMethodCall) {
        let typeName = this.getTypeName();
        // Fixes shim to be backward compatable with Node v0 to v4
        if (typeName === '[object Object]') {
            typeName = 'null';
        }
        const methodName = this.getMethodName();
        if (functionName) {
            if (typeName && functionName.indexOf(typeName) != 0) {
                line += typeName + '.';
            }
            line += functionName;
            if (methodName &&
                functionName.indexOf('.' + methodName) !=
                    functionName.length - methodName.length - 1) {
                line += ' [as ' + methodName + ']';
            }
        }
        else {
            line += typeName + '.' + (methodName || '<anonymous>');
        }
    }
    else if (isConstructor) {
        line += 'new ' + (functionName || '<anonymous>');
    }
    else if (functionName) {
        line += functionName;
    }
    else {
        line += fileLocation;
        addSuffix = false;
    }
    if (addSuffix) {
        line += ' (' + fileLocation + ')';
    }
    return line;
}
function extractCodeFrames(map, pos) {
    const sourceContent = map.sourceContentFor(pos.source, true);
    if (sourceContent == null)
        return [];
    // We adjusted lines to be 1 based (see mapSourcePosition)
    const lineno = pos.line - 1;
    const lines = sourceContent.split('\n');
    const beforeStart = Math.max(0, lineno - INCLUDE_CODE_BEFORE);
    const beforeEnd = Math.min(lines.length, lineno + 1);
    const afterStart = Math.min(lines.length, beforeEnd);
    const afterEnd = Math.min(lines.length, afterStart + INCLUDE_CODE_AFTER);
    const framesBefore = lines.slice(beforeStart, beforeEnd).map((x, idx) => {
        const lineGutter = (beforeStart + idx + 1)
            .toString()
            .padStart(CODE_FRAME_LINE_GUTTER_WIDTH);
        return `${lineGutter}: ${x}`;
    });
    if (pos.column >= 0) {
        framesBefore.push(' '.repeat(CODE_FRAME_LINE_GUTTER_WIDTH + 1 + pos.column) + '^');
    }
    const framesAfter = lines.slice(afterStart, afterEnd).map((x, idx) => {
        const lineGutter = (afterStart + idx + 1)
            .toString()
            .padStart(CODE_FRAME_LINE_GUTTER_WIDTH);
        return `${lineGutter}: ${x}`;
    });
    return framesBefore.concat(framesAfter);
}
//# sourceMappingURL=sourcemap-support.js.map
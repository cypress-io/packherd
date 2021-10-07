"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupBenchmark = void 0;
const debug_1 = __importDefault(require("debug"));
const assert_1 = require("assert");
const fs_1 = require("fs");
const performance_now_1 = __importDefault(require("performance-now"));
const utils_1 = require("./utils");
const path_1 = __importDefault(require("path"));
const logInfo = (0, debug_1.default)('packherd:info');
const logDebug = (0, debug_1.default)('packherd:debug');
const logError = (0, debug_1.default)('packherd:error');
class InactiveBenchmark {
    time(_key) { }
    timeEnd(_key, _origin, _stack) { }
    write() { }
}
class ActiveBenchmark {
    constructor(projectBaseDir, outputPath) {
        this.projectBaseDir = projectBaseDir;
        this.outputPath = outputPath;
        this.pending = new Map();
        this.packherdExports = new Map();
        this.packherdDefinitions = new Map();
        this.moduleLoads = new Map();
    }
    time(key) {
        const now = (0, performance_now_1.default)();
        this.pending.set(key, now);
    }
    timeEnd(key, origin, stack) {
        const before = this.pending.get(key);
        (0, assert_1.strict)(before != null, `${key} not added via time()`);
        const now = (0, performance_now_1.default)();
        const duration = now - before;
        switch (origin) {
            case 'packherd:export':
                this.packherdExports.set(key, { duration, stack });
                break;
            case 'packherd:definition':
                this.packherdDefinitions.set(key, { duration, stack });
                break;
            case 'Module._load':
                this.moduleLoads.set(key, { duration, stack });
                break;
            default:
                assert_1.strict.fail(`Not supporting timing ${origin} loads`);
        }
        this.pending.delete(key);
    }
    write() {
        (0, fs_1.writeFileSync)(this.outputPath, this.json(), 'utf8');
    }
    _fullPath(info) {
        return {
            ...info,
            stack: info.stack.map((x) => path_1.default.resolve(this.projectBaseDir, x)),
        };
    }
    json() {
        const packherdExports = [];
        const packherdDefinitions = [];
        const moduleLoads = [];
        for (const [key, info] of this.packherdExports) {
            packherdExports.push([key, this._fullPath(info)]);
        }
        for (const [key, info] of this.packherdDefinitions) {
            packherdDefinitions.push([key, this._fullPath(info)]);
        }
        for (const [key, info] of this.moduleLoads) {
            moduleLoads.push([key, this._fullPath(info)]);
        }
        const loadInfos = {
            packherdExports,
            packherdDefinitions,
            moduleLoads,
        };
        return JSON.stringify(loadInfos, null, 2);
    }
}
/**
 * Depending on the provided outputPath being defined or not, it sets up
 * an inactive benchmark which does nothing or an active one which
 * collects and writes out data.
 */
function setupBenchmark(projectBaseDir, outputPath) {
    if (outputPath == null)
        return new InactiveBenchmark();
    const benchmark = new ActiveBenchmark(projectBaseDir, outputPath);
    logDebug('Setting up require stats dump on process exit');
    const dir = path_1.default.dirname(outputPath);
    try {
        (0, utils_1.ensureDirSync)(dir);
        process.on('exit', () => {
            benchmark.write();
            logInfo('Wrote require stats to %s', outputPath);
        });
    }
    catch (err) {
        logError('%s directory does not exist, will not write require stats');
        logError(err);
    }
    return benchmark;
}
exports.setupBenchmark = setupBenchmark;
//# sourceMappingURL=benchmark.js.map
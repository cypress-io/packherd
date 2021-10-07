"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Analyzer = void 0;
const assert_1 = require("assert");
const depstats_1 = require("depstats");
const path_1 = __importDefault(require("path"));
const utils_1 = require("./utils");
class Analyzer {
    constructor(allSorted, metaData) {
        this.metaData = metaData;
        this.all = new Map(allSorted);
    }
    async importsByParent() {
        const map = new Map();
        for (const [key, { imports }] of Object.entries(this.metaData.inputs)) {
            map.set(path_1.default.resolve(this.metaData.projectBaseDir, key), imports.map((x) => path_1.default.resolve(this.metaData.projectBaseDir, x.path)));
        }
        return map;
    }
    async analyze() {
        const analyzeds = [];
        const imports = await this.importsByParent();
        const packages = await (0, depstats_1.depStats)(this.metaData.projectBaseDir, Array.from(this.all.keys()));
        for (const [key, { duration }] of this.all) {
            analyzeds.push(this._produceParent(key, duration, imports, packages));
        }
        return analyzeds.sort(utils_1.byDurationReversed).filter((x) => x.duration > 1);
    }
    _produceParent(key, duration, imports, packages) {
        const children = imports.get(key);
        const childrenWithDuration = children == null
            ? []
            : children.map((x) => {
                const loadInfo = this.all.get(x);
                const stat = (0, depstats_1.modulePackageInfo)(packages, x);
                const duration = loadInfo == null ? 0 : loadInfo.duration;
                const size = stat == null ? 'n/a' : stat.mdl.humanSize;
                return { path: x, duration, size };
            });
        const stat = (0, depstats_1.modulePackageInfo)(packages, key);
        (0, assert_1.strict)(stat != null, `unable to find stat for ${key}`);
        const { pkg, mdl } = stat;
        return {
            path: key,
            package: `${pkg.name}@${pkg.version}`,
            duration: (0, utils_1.threeDecimals)(duration),
            size: mdl.humanSize,
            children: childrenWithDuration
                .sort(utils_1.byDurationReversed)
                .map((x) => ({ ...x, duration: (0, utils_1.threeDecimals)(x.duration) })),
        };
    }
}
exports.Analyzer = Analyzer;
//# sourceMappingURL=analyzer.js.map
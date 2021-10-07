"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const utils_1 = require("../src/utils");
const analyzer_1 = require("./analyzer");
const utils_2 = require("./utils");
// @ts-ignore
function makePretty([key, { duration, stack }]) {
    return [key, { duration: (0, utils_2.threeDecimals)(duration), stack }];
}
function byDurationReversed([_1, info1], [_2, info2]) {
    return info1.duration <= info2.duration ? 1 : -1;
}
const benchFile = process.argv[2];
const esbuildMetaFile = process.argv[3];
try {
    (0, assert_1.strict)(benchFile != null, 'need to provide benchFile as first arg');
    (0, utils_1.canAccessSync)(benchFile);
}
catch (err) {
    console.error('Cannot access %s, %o', benchFile, err);
    process.exit(1);
}
try {
    (0, assert_1.strict)(esbuildMetaFile != null, 'need to provide esbuildMetaFile as second arg');
    (0, utils_1.canAccessSync)(esbuildMetaFile);
}
catch (err) {
    console.error('Cannot access %s, %o', esbuildMetaFile, err);
    process.exit(1);
}
const { packherdExports, packherdDefinitions, moduleLoads, } = require(benchFile);
packherdExports.sort(byDurationReversed);
packherdDefinitions.sort(byDurationReversed);
moduleLoads.sort(byDurationReversed);
const allSorted = [
    ...packherdExports,
    ...packherdDefinitions,
    ...moduleLoads,
].sort(byDurationReversed);
(async () => {
    try {
        const analyzed = await new analyzer_1.Analyzer(allSorted, require(esbuildMetaFile)).analyze();
        const result = {
            // packherdExports: packherdExports.map(makePretty),
            // packherdDefinitions: packherdDefinitions.map(makePretty),
            // moduleLoads: moduleLoads.map(makePretty),
            // allSorted: allSorted.map(makePretty),
            analyzed: Array.from(analyzed),
        };
        console.log(JSON.stringify(result, null, 2));
    }
    catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
//# sourceMappingURL=process-benchmark.js.map
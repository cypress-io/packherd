"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.byDurationReversed = exports.threeDecimals = void 0;
function threeDecimals(n) {
    return Math.round(n * 1000) / 1000;
}
exports.threeDecimals = threeDecimals;
function byDurationReversed({ duration: dur1 }, { duration: dur2 }) {
    return dur1 <= dur2 ? 1 : -1;
}
exports.byDurationReversed = byDurationReversed;
//# sourceMappingURL=utils.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gracefulifies = void 0;
const fs_1 = __importDefault(require("fs"));
const fs_extra_1 = __importDefault(require("fs-extra"));
function gracefulifies() {
    return {
        // @ts-ignore
        fseGracefulify: typeof fs_extra_1.default.gracefulify,
        // @ts-ignore
        fsGracefulify: typeof fs_1.default.gracefulify,
    };
}
exports.gracefulifies = gracefulifies;
//# sourceMappingURL=import-fs-fs-extra.js.map
'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WRITABLE = exports.STREAM = exports.EE = void 0;
const check_ee_1 = require("./check-ee");
const stream_1 = __importDefault(require("stream"));
exports.EE = (0, check_ee_1.getEmitter)();
exports.STREAM = stream_1.default;
exports.WRITABLE = stream_1.default.Writable;
//# sourceMappingURL=check-stream.js.map
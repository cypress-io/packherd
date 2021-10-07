"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tape_1 = __importDefault(require("tape"));
// NOTE: these relative paths only work from the ./dist folder
require('../../../tests/fixtures/circular-deps/hook-require');
const result = require('../../../tests/fixtures/circular-deps/lib/entry');
(0, tape_1.default)('circular deps', (t) => {
    t.equal(result.origin, 'definitions', 'intercepted module load');
    t.equal(result.result, 4, 'gets result');
    t.end();
});
//# sourceMappingURL=test.js.map
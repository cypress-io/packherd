"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmitter = void 0;
const events_1 = require("events");
function getEmitter() {
    return new events_1.EventEmitter();
}
exports.getEmitter = getEmitter;
//# sourceMappingURL=check-ee.js.map
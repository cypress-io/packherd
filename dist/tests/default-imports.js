"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tape_1 = __importDefault(require("tape"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const exec = (0, util_1.promisify)(child_process_1.exec);
const projectBaseDir = path_1.default.join(__dirname, 'fixtures', 'default-imports');
(0, tape_1.default)('default properties on imports do not respect inherited properties', async (t) => {
    const cmd = `${process.execPath} -r ${projectBaseDir}/hook-require.js` +
        ` ${projectBaseDir}/entry.js`;
    try {
        const { stdout } = await exec(cmd);
        const res = JSON.parse(stdout);
        /* Returned the below before the fix
        { STREAMFN: 'EventEmitter',
          WRITABLE: 'undefined' } */
        t.equal(res.STREAMFN, 'Stream', 'stream export is Stream constructor');
        t.equal(res.WRITABLE, 'function', 'stream.Writable is function');
    }
    catch (err) {
        t.fail(err.toString());
    }
});
//# sourceMappingURL=default-imports.js.map
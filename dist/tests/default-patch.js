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
// Testing the case where `fs-extra` inherited the `default` added to `fs` before.
// That `default` property wasn't patched and resulting in the original `fs` instance
// for `import fse from 'fs-extra'`.
const projectBaseDir = path_1.default.join(__dirname, 'fixtures', 'default-patch');
(0, tape_1.default)('default added manually do not affect default resolution when patching a module', async (t) => {
    const cmd = `${process.execPath} -r ${projectBaseDir}/hook-require.js` +
        ` ${projectBaseDir}/entry.js`;
    try {
        const { stdout } = await exec(cmd);
        const res = JSON.parse(stdout);
        // TODO(thlorenz): we have to decide if it is fine that `fs.default` is not patched while `fs` is
        // therefore `import`ing it results in the unpatched version.
        // This is not the default behavior, but might be desired to enforce devs to import `fse` instead
        // which should already be enforced by the typechecker anyways.
        t.deepEqual(res, { fseGracefulify: 'function', fsGracefulify: 'undefined' });
    }
    catch (err) {
        t.fail(err.toString());
    }
});
//# sourceMappingURL=default-patch.js.map
import test from 'tape'
import { exec as execOrig } from 'child_process'
import { promisify } from 'util'
import path from 'path'
const exec = promisify(execOrig)

// Testing the case where `fs-extra` inherited the `default` added to `fs` before.
// That `default` property wasn't patched and resulting in the original `fs` instance
// for `import fse from 'fs-extra'`.

const projectBaseDir = path.join(__dirname, 'fixtures', 'default-patch')

test('default added manually do not affect default resolution when patching a module', async (t) => {
  const cmd =
    `${process.execPath} -r ${projectBaseDir}/hook-require.js` +
    ` ${projectBaseDir}/entry.js`

  try {
    const { stdout } = await exec(cmd)
    const res = JSON.parse(stdout)
    // TODO(thlorenz): we have to decide if it is fine that `fs.default` is not patched while `fs` is
    // therefore `import`ing it results in the unpatched version.
    // This is not the default behavior, but might be desired to enforce devs to import `fse` instead
    // which should already be enforced by the typechecker anyways.
    t.deepEqual(res, { fseGracefulify: 'function', fsGracefulify: 'undefined' })
  } catch (err: any) {
    t.fail(err.toString())
  }
})

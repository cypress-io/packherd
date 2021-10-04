import test from 'tape'
import { exec as execOrig } from 'child_process'
import { promisify } from 'util'
import path from 'path'
const exec = promisify(execOrig)

const projectBaseDir = path.join(__dirname, 'fixtures', 'default-imports')

test('default properties on imports do not respect inherited properties', async (t) => {
  const cmd =
    `${process.execPath} -r ${projectBaseDir}/hook-require.js` +
    ` ${projectBaseDir}/entry.js`

  try {
    const { stdout } = await exec(cmd)
    const res = JSON.parse(stdout)
    /* Returned the below before the fix
    { STREAMFN: 'EventEmitter',
      WRITABLE: 'undefined' } */
    t.equal(res.STREAMFN, 'Stream', 'stream export is Stream constructor')
    t.equal(res.WRITABLE, 'function', 'stream.Writable is function')
  } catch (err: any) {
    t.fail(err.toString())
  }
})

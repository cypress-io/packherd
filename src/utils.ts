import fs from 'fs'
import { tmpdir } from 'os'
import path from 'path'

export function canAccessSync(p: string) {
  try {
    fs.accessSync(p)
    return true
  } catch (_) {
    return false
  }
}

export function ensureDirSync(dir: string) {
  if (!canAccessSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    return
  }
  // dir already exists, make sure it isn't a file
  const stat = fs.statSync(dir)
  if (!stat.isDirectory()) {
    throw new Error(`'${dir}' is not a directory`)
  }
}

export function tmpFilePaths() {
  const bundleTmpDir = path.join(tmpdir(), 'packherd')
  ensureDirSync(bundleTmpDir)

  const outfile = path.join(bundleTmpDir, 'bundle.js')

  return { outfile }
}

export const forwardToNativeSlash =
  path.sep === path.posix.sep
    ? (p: string) => p
    : (p: string) =>
        // Operating on the path will cause Node.js to _fix_ the slash used to be native
        // to any wannabe operation system it is running on which doesn't use '/'
        path.join(path.dirname(p), path.basename(p))

import fs from 'fs'
import { tmpdir } from 'os'
import path from 'path'

/**
 * Ensures that a file or directory is accessible to the current user.
 */
export function canAccessSync(p: string) {
  try {
    fs.accessSync(p)
    return true
  } catch (_) {
    return false
  }
}

/**
 * Ensures that a directory is accessible to the current user.
 * IF the directory doesn't exist it attempts to create it recursively.
 */
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

/**
 * Determines where to store temporary output files produced by esbuild.
 */
export function tmpFilePaths() {
  const bundleTmpDir = path.join(tmpdir(), 'packherd')
  ensureDirSync(bundleTmpDir)

  const outfile = path.join(bundleTmpDir, 'bundle.js')

  return { outfile }
}

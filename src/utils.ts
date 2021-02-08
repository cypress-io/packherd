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
  const metafile = path.join(bundleTmpDir, 'meta.json')

  return { outfile, metafile }
}

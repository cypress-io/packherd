import fs from 'fs'
import fse from 'fs-extra'

export function gracefulifies() {
  return {
    // @ts-ignore
    fseGracefulify: typeof fse.gracefulify,
    // @ts-ignore
    fsGracefulify: typeof fs.gracefulify,
  }
}

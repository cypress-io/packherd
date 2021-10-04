'use strict'

// @ts-check

const projectBaseDir = __dirname

// This works only when run from inside ./dist, remove one '../' to run directly
const { packherdRequire } = require('../../../../dist/src/require')

packherdRequire(projectBaseDir, {
  transpileOpts: {
    supportTS: true,
    tsconfig: {
      compilerOptions: {
        useDefineForClassFields: false, // default
        importsNotUsedAsValues: 'remove', // default
      },
    },
  },
})

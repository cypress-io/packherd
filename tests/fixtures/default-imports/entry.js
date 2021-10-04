'use strict'

const { STREAM, WRITABLE } = require('./check-stream')

const streamFn = STREAM.toString().slice('function '.length)
const parenIdx = streamFn.indexOf('(')
console.log(
  JSON.stringify(
    {
      STREAMFN: streamFn.slice(0, parenIdx),
      WRITABLE: typeof WRITABLE,
    },
    null,
    2
  )
)

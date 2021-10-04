'use strict'

import { getEmitter } from './check-ee'
import stream from 'stream'

export const EE = getEmitter()
export const STREAM = stream
export const WRITABLE = stream.Writable

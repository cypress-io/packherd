import { EventEmitter } from 'events'

export function getEmitter(): EventEmitter {
  return new EventEmitter()
}

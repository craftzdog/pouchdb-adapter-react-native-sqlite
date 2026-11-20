import 'react-native-url-polyfill/auto'
import { Buffer } from '@craftzdog/react-native-buffer'

/**
 * Gives `fn` a `toString` that returns `src`. `babel-plugin-preserve-fn-source.js` wraps the
 * test files' functions in it. A function object that rejects the redefinition is returned as is.
 */
function preserveFnSource(fn, src) {
  try {
    Object.defineProperty(fn, 'toString', {
      value() {
        return src
      },
      configurable: true,
      writable: true
    })
  } catch {}
  return fn
}

/** The part of the Web `Event` API that chai's plugin system uses. */
class EventPolyfill {
  constructor(type) {
    this.type = type
  }
}

/** The part of the Web `EventTarget` API that chai's plugin system uses. */
class EventTargetPolyfill {
  constructor() {
    this._listeners = {}
  }

  addEventListener(type, callback) {
    if (!this._listeners[type]) {
      this._listeners[type] = []
    }
    this._listeners[type].push(callback)
  }

  removeEventListener(type, callback) {
    const listeners = this._listeners[type]
    if (listeners) {
      this._listeners[type] = listeners.filter(cb => cb !== callback)
    }
  }

  dispatchEvent(event) {
    const listeners = this._listeners[event.type]
    if (listeners) {
      listeners.slice().forEach(cb => cb.call(this, event))
    }
    return true
  }
}

if (globalThis.Buffer === undefined) {
  globalThis.Buffer = Buffer
}

globalThis.process = globalThis.process || {}
globalThis.process.env = globalThis.process.env || {}

globalThis.__preserveFnSource = preserveFnSource

if (globalThis.location === undefined) {
  globalThis.location = {}
}

if (globalThis.Event === undefined) {
  globalThis.Event = EventPolyfill
}

if (globalThis.EventTarget === undefined) {
  globalThis.EventTarget = EventTargetPolyfill
}

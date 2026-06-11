// Node-oriented global shims required by the PouchDB conformance suite and
// mocha when they run inside the React Native (Hermes) JS engine.
//
// Imported first from index.js so these globals exist before any test file,
// mocha, or PouchDB module is evaluated.
import 'react-native-url-polyfill/auto' // whatwg-compliant URL/URLSearchParams; Hermes' built-in URL is incomplete (testUtils.parseHostWithCreds reads .username/.password/.origin)
import { Buffer } from 'buffer' // aliased to @craftzdog/react-native-buffer (babel.config.js)

// PouchDB's binary/attachment helpers and the test suite reference global.Buffer.
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer
}

// commonUtils.isNode() keys off `process` existing and `process.browser` being
// falsy. RN already provides `process`; we only ensure `env` exists and merge
// into it so the RN-provided NODE_ENV is preserved (never clobbered).
global.process = global.process || {}
global.process.env = global.process.env || {}

// Restore real function source for `fn.toString()` under Hermes (which strips it
// to "[bytecode]"). Injected around every FunctionExpression in the test files
// by the babel "preserve-fn-source" plugin, so pouchdb can compile design-doc
// views/filters (which it builds by eval-ing `fn.toString()`). Non-enumerable so
// it never surfaces in Object.keys / for-in over a function.
global.__preserveFnSource = function (fn, src) {
  try {
    Object.defineProperty(fn, 'toString', {
      value: function () {
        return src
      },
      configurable: true,
      writable: true,
    })
  } catch (e) {
    // Some exotic function objects may reject the redefinition; harmless.
  }
  return fn
}

// mocha's browser entry and some node-oriented libraries probe global.location.
if (typeof global.location === 'undefined') {
  global.location = {}
}

// chai 6's plugin system uses the Web EventTarget/Event API
// (`new EventTarget()`, `class PluginEvent extends Event`), which Hermes does
// not provide. chai only needs add/remove/dispatch + Event subclassing (no
// target/detail/options), so a tiny self-contained polyfill is enough and avoids
// pulling a spec-heavy dependency.
if (typeof global.Event === 'undefined') {
  global.Event = class Event {
    constructor(type) {
      this.type = type
    }
  }
}

if (typeof global.EventTarget === 'undefined') {
  global.EventTarget = class EventTarget {
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
        this._listeners[type] = listeners.filter((cb) => cb !== callback)
      }
    }

    dispatchEvent(event) {
      const listeners = this._listeners[event.type]
      if (listeners) {
        listeners.slice().forEach((cb) => cb.call(this, event))
      }
      return true
    }
  }
}

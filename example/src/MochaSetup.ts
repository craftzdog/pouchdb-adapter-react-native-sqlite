import type { MochaClass, MochaInstance, Suite } from './mocha-types'

/**
 * Installs the *real* mocha BDD interface as globals so the PouchDB conformance
 * test files — authored for the mocha CLI — run verbatim under Hermes.
 *
 * The mocha runtime itself is loaded for its side effects from `index.js`
 * (`import 'mocha'`), which Metro resolves via the package `browser` field to
 * `browser-entry.js`. That entry assigns the Mocha **class** to `global.Mocha`
 * and a singleton **instance** to `global.mocha`. We read both off `globalThis`
 * here (typed with our local ./mocha-types) rather than importing `'mocha'` in a
 * typechecked file — see ./mocha-types for why.
 */
const g = globalThis as unknown as { Mocha: MochaClass; mocha: MochaInstance }

const Mocha = g.Mocha
const mocha = g.mocha

// `mocha.setup({ ui: 'bdd' })` emits the `pre-require` event against `global`,
// which installs describe/it/before/after/beforeEach/afterEach — plus the
// runtime features the suite relies on (`done` callbacks, `this.timeout()`,
// `this.skip()`) — onto the global scope.
mocha.setup({ ui: 'bdd' })

// Keep the suite/test tree intact between runs so the screen's "Run" button can
// re-run the suite without reloading the bundle.
mocha.cleanReferencesAfterRun(false)

// Generous default; individual suites raise it further via `this.timeout()`.
mocha.suite.timeout(60 * 1000)

export const rootSuite: Suite = mocha.suite
export { Mocha, mocha }

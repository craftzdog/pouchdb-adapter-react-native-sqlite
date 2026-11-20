import type { Suite } from './mocha-types'

const { Mocha, mocha } = globalThis

const DEFAULT_TEST_TIMEOUT_MS = 60 * 1000

/**
 * Wraps the global `describe` so that a test file Fast Refresh evaluates again replaces its
 * top-level suites instead of registering them a second time.
 */
function replaceStaleSuitesOnFastRefresh() {
  const originalDescribe = globalThis.describe
  globalThis.describe = Object.assign((title: string, fn: () => void): Suite => {
    const suite = originalDescribe(title, fn)
    const parent = suite.parent
    if (parent?.root) {
      const staleIndex = parent.suites.findIndex((s: Suite) => s !== suite && s.title === title)
      if (staleIndex !== -1) {
        parent.suites.splice(parent.suites.indexOf(suite), 1)
        parent.suites.splice(staleIndex, 1, suite)
      }
    }
    return suite
  }, originalDescribe)
}

mocha.setup({ ui: 'bdd' })
replaceStaleSuitesOnFastRefresh()
mocha.cleanReferencesAfterRun(false)
mocha.suite.timeout(DEFAULT_TEST_TIMEOUT_MS)

export const rootSuite: Suite = mocha.suite
export { Mocha, mocha }

import { useEffect, useState } from 'react'
import type * as MochaTypes from './mocha-types'
import { rootSuite } from './MochaSetup'
import type { Suites } from './types'

// Side-effect import: requires every test file, which registers their suites and
// tests onto the root suite (describe/it run at module-evaluation time).
// Imported as './tests/index' (not './tests') to avoid a case-insensitive
// filesystem collision with the sibling './Tests' component.
import './tests/index'

export const useTestList = (): Suites => {
  const [suites, setSuites] = useState<Suites>({})

  // this sets suites initially
  useEffect(() => {
    if (Object.keys(suites).length === 0) {
      setSuites(getInitialSuites())
    }
  }, [suites])

  return suites
}

const getInitialSuites = (): Suites => {
  const localSuites: Suites = {}

  // Each top-level suite is one test file; total() counts its tests recursively.
  rootSuite.suites.forEach((s: MochaTypes.Suite) => {
    localSuites[s.title] = { value: false, count: s.total() }
  })

  return localSuites
}

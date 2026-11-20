import { useState } from 'react'

import type { Suite } from './mocha-types'
import { rootSuite } from './MochaSetup'
import type { Suites } from './types'
import './tests'

const getInitialSuites = (): Suites => {
  const localSuites: Suites = {}

  rootSuite.suites.forEach((s: Suite) => {
    localSuites[s.title] = { value: false, count: s.total() }
  })

  return localSuites
}

export const useTestList = (): Suites => {
  const [suites] = useState<Suites>(getInitialSuites)
  return suites
}

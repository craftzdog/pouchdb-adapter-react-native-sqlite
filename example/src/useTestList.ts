import { useEffect, useState } from 'react'

import type * as MochaTypes from './mocha-types'
import { rootSuite } from './MochaSetup'
import type { Suites } from './types'
import './tests'

export const useTestList = (): Suites => {
  const [suites, setSuites] = useState<Suites>({})

  useEffect(() => {
    if (Object.keys(suites).length === 0) {
      setSuites(getInitialSuites())
    }
  }, [suites])

  return suites
}

const getInitialSuites = (): Suites => {
  const localSuites: Suites = {}

  rootSuite.suites.forEach((s: MochaTypes.Suite) => {
    localSuites[s.title] = { value: false, count: s.total() }
  })

  return localSuites
}

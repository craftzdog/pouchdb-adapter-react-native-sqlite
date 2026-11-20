export interface Suite {
  title: string
  root: boolean
  parent?: Suite
  suites: Array<Suite>
  total(): number
  timeout(ms: number): void
  eachTest(fn: (test: Test) => void): void
}

export interface Test {
  title: string
  parent?: Suite
  reset(): void
}

export type Runnable = Test

export interface RunnerConstants {
  EVENT_RUN_BEGIN: string
  EVENT_RUN_END: string
  EVENT_TEST_FAIL: string
  EVENT_TEST_PASS: string
  EVENT_TEST_PENDING: string
  EVENT_TEST_END: string
  EVENT_SUITE_BEGIN: string
  EVENT_SUITE_END: string
}

export interface Runner {
  stats: unknown
  once(event: string, fn: (...args: Array<any>) => void): Runner
  on(event: string, fn: (...args: Array<any>) => void): Runner
  run(): Runner
  abort(): void
}

export interface RunnerConstructor {
  new (suite: Suite): Runner
  constants: RunnerConstants
}

export interface MochaClass {
  Runner: RunnerConstructor
}

export interface MochaInstance {
  setup(opts: { ui: string }): MochaInstance
  cleanReferencesAfterRun(clean: boolean): MochaInstance
  suite: Suite
}

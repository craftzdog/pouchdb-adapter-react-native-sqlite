import { reactNative } from 'vitest-native'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [reactNative({ projectBabel: 'never' })],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tools/**/*.test.mjs']
  }
})

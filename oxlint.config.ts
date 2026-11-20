import nkzw from '@nkzw/oxlint-config'
import { defineConfig } from 'oxlint'

const rulesThatDoNotFitThisCode = {
  '@nkzw/no-instanceof': 'off',
  'unicorn/text-encoding-identifier-case': 'off'
} as const

const rulesNotAdoptedYet = {
  'no-console': 'off',
  'no-undef': 'off',
  'react/purity': 'off',
  'react/set-state-in-effect': 'off'
} as const

const correctnessRulesOfAddedPlugins = {
  'promise/no-callback-in-promise': 'off',
  'vitest/require-mock-type-parameters': 'off'
} as const

export default defineConfig({
  extends: [nkzw],
  categories: {
    correctness: 'error'
  },
  jsPlugins: [
    {
      name: 'react-native',
      specifier: 'oxlint-plugin-react-native'
    },
    {
      name: 'local',
      specifier: './tools/oxlint/local-plugin.mjs'
    }
  ],
  settings: {
    react: {
      version: '19.3.1'
    }
  },
  rules: {
    'local/no-comments': 'error',
    'typescript/no-explicit-any': 'off',
    'typescript/no-this-alias': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }],
    'typescript/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }
    ],
    'react-native/no-color-literals': 'warn',
    'react-native/no-inline-styles': 'warn',
    'react-native/no-single-element-style-arrays': 'warn',
    'react-native/no-unused-styles': 'warn',
    'react-native/no-raw-text': 'off',
    'react-native/sort-styles': 'off',
    ...rulesThatDoNotFitThisCode,
    ...rulesNotAdoptedYet,
    ...correctnessRulesOfAddedPlugins
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
      rules: {
        'no-unreachable': 'error',
        'prefer-spread': 'off',
        'typescript/no-floating-promises': 'off'
      }
    },
    {
      files: ['**/*.test.ts', '**/*.test.tsx', '**/*.test.mjs'],
      rules: {
        'quality/no-chained-type-assertions': 'off'
      }
    },
    {
      files: ['example/*.config.js'],
      rules: {
        'typescript/no-require-imports': 'off'
      }
    }
  ],
  ignorePatterns: [
    'lib/**',
    'example/android/**',
    'example/ios/**',
    'example/vendor/**',
    'example/src/tests/**'
  ]
})

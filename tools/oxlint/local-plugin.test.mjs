import { RuleTester } from 'oxlint/plugins-dev'
import { describe, it } from 'vitest'

import localPlugin from './local-plugin.mjs'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } }
})

const error = { messageId: 'noComments' }

ruleTester.run('no-comments', localPlugin.rules['no-comments'], {
  valid: [
    'const answer = 42',
    '/** Opens the database. */\nexport function openDB() {}',
    '/** Opens the database. */\nfunction openDB() {}',
    '/** Opens the database. */\nexport default function openDB() {}',
    '/** The default page size. */\nexport const PAGE_SIZE = 4096',
    '/** The default page size. */\nconst PAGE_SIZE = 4096',
    '/** A queue. */\nexport class Queue {}',
    '/** Options. */\nexport type Options = { name: string }',
    '/** Options. */\nexport interface Options { name: string }',
    'interface Options {\n  /** The file name. */\n  name: string\n}',
    'class Queue {\n  /** Runs the next item. */\n  run() {}\n}',
    'class Queue {\n  /** Pending items. */\n  items = []\n}',
    'const config = {\n  /** Where to look. */\n  roots: []\n}',
    '/** Statuses. */\nexport enum Status {\n  /** Running. */\n  Running\n}',
    '/** The plugin. */\nmodule.exports = function plugin() {}',
    '#!/usr/bin/env node\nconst answer = 42'
  ],
  invalid: [
    { code: '// explains\nconst answer = 42', errors: [error] },
    { code: 'const answer = 42 // explains', errors: [error] },
    { code: '/* explains */\nconst answer = 42', errors: [error] },
    { code: '// @ts-ignore\nconst answer: number = 42', errors: [error] },
    { code: '// @ts-expect-error\nconst answer: number = 42', errors: [error] },
    {
      code: 'function run() {\n  /** explains */\n  return 42\n}',
      errors: [error]
    },
    {
      code: 'function run() {\n  /** explains */\n  const answer = 42\n  return answer\n}',
      errors: [error]
    },
    { code: 'const answer = 42\n/** dangling */', errors: [error] },
    { code: 'run(/** explains */ 42)', errors: [error] }
  ]
})

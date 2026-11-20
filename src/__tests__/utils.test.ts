import { describe, expect, it } from 'vitest'

import { isUniqueConstraintError } from '../utils'

describe('isUniqueConstraintError', () => {
  it('matches the SQLite error code', () => {
    expect(isUniqueConstraintError({ code: 'SQLITE_CONSTRAINT_UNIQUE' })).toBe(true)
  })

  it('matches the message of an error without a code', () => {
    const error = new Error('UNIQUE constraint failed: local-store.id')
    expect(isUniqueConstraintError(error)).toBe(true)
  })

  it('rejects other errors', () => {
    expect(isUniqueConstraintError(new Error('no such table: local-store'))).toBe(false)
    expect(isUniqueConstraintError({ code: 'SQLITE_BUSY' })).toBe(false)
  })
})

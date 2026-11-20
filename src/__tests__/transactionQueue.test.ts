import type { DB, Transaction } from '@op-engineering/op-sqlite'
import { describe, expect, it, vi } from 'vitest'

import { TransactionQueue } from '../transactionQueue'

const WRITE_LOCK = "UPDATE 'metadata-store' SET dbid = dbid"

const makeDb = ({ failCommit, failLock }: { failCommit?: Error; failLock?: Error } = {}) => {
  const statements: Array<string> = []
  const executeSync = (query: string) => {
    statements.push(query)
    if (query === 'COMMIT;' && failCommit) {
      throw failCommit
    }
    if (query === WRITE_LOCK && failLock) {
      throw failLock
    }
    return { rows: [] }
  }
  const transaction = async (fn: (tx: Transaction) => Promise<void>) => {
    executeSync('BEGIN TRANSACTION;')
    try {
      await fn({
        execute: async (query: string) => executeSync(query)
      } as unknown as Transaction)
      executeSync('COMMIT;')
    } catch (error) {
      executeSync('ROLLBACK;')
      throw error
    }
  }
  return { db: { transaction } as unknown as DB, statements }
}

describe('TransactionQueue', () => {
  it('commits a write and resolves after the commit', async () => {
    const { db, statements } = makeDb()
    const queue = new TransactionQueue(db)

    await queue.push(async tx => {
      await tx.execute('INSERT INTO docs VALUES (1)')
    })

    expect(statements).toEqual([
      'BEGIN TRANSACTION;',
      WRITE_LOCK,
      'INSERT INTO docs VALUES (1)',
      'COMMIT;'
    ])
  })

  it('rolls back and rejects when the write throws', async () => {
    const { db, statements } = makeDb()
    const queue = new TransactionQueue(db)
    const failure = new Error('constraint failed')

    await expect(
      queue.push(async tx => {
        await tx.execute('INSERT INTO docs VALUES (1)')
        throw failure
      })
    ).rejects.toBe(failure)

    expect(statements).toEqual([
      'BEGIN TRANSACTION;',
      WRITE_LOCK,
      'INSERT INTO docs VALUES (1)',
      'ROLLBACK;'
    ])
  })

  it('rejects when the commit fails', async () => {
    const diskFull = new Error('database or disk is full')
    const { db } = makeDb({ failCommit: diskFull })
    const queue = new TransactionQueue(db)

    await expect(queue.push(async () => {})).rejects.toBe(diskFull)
  })

  it('rolls back and rejects when a read throws', async () => {
    const { db, statements } = makeDb()
    const queue = new TransactionQueue(db)
    const failure = new Error('no such table')

    await expect(
      queue.pushReadOnly(async () => {
        throw failure
      })
    ).rejects.toBe(failure)

    expect(statements).toEqual(['BEGIN TRANSACTION;', 'ROLLBACK;'])
  })

  it('runs the next transaction after one that failed', async () => {
    const { db, statements } = makeDb()
    const queue = new TransactionQueue(db)

    const failed = queue.push(async () => {
      throw new Error('constraint failed')
    })
    const next = queue.push(async tx => {
      await tx.execute('INSERT INTO docs VALUES (2)')
    })

    await expect(failed).rejects.toThrow('constraint failed')
    await next
    expect(statements.slice(-4)).toEqual([
      'BEGIN TRANSACTION;',
      WRITE_LOCK,
      'INSERT INTO docs VALUES (2)',
      'COMMIT;'
    ])
  })

  it('takes the write lock before the first statement of a write', async () => {
    const { db, statements } = makeDb()
    const queue = new TransactionQueue(db)

    await queue.push(async tx => {
      await tx.execute('SELECT 1')
    })

    expect(statements.slice(0, 3)).toEqual(['BEGIN TRANSACTION;', WRITE_LOCK, 'SELECT 1'])
  })

  it('leaves a read without the write lock', async () => {
    const { db, statements } = makeDb()
    const queue = new TransactionQueue(db)

    await queue.pushReadOnly(async tx => {
      await tx.execute('SELECT 1')
    })

    expect(statements).toEqual(['BEGIN TRANSACTION;', 'SELECT 1', 'COMMIT;'])
  })

  it('rejects a write whose lock cannot be taken, without running it', async () => {
    const locked = new Error('database is locked')
    const { db, statements } = makeDb({ failLock: locked })
    const queue = new TransactionQueue(db)
    const fn = vi.fn(async () => {})

    await expect(queue.push(fn)).rejects.toBe(locked)

    expect(fn).not.toHaveBeenCalled()
    expect(statements).toEqual(['BEGIN TRANSACTION;', WRITE_LOCK, 'ROLLBACK;'])
  })
})

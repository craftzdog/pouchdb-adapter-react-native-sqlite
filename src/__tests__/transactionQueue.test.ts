import type { DB, Transaction } from '@op-engineering/op-sqlite'
import { TransactionQueue } from '../transactionQueue'

const makeDb = ({ failCommit }: { failCommit?: Error } = {}) => {
  const statements: string[] = []
  const executeSync = (query: string) => {
    statements.push(query)
    if (query === 'COMMIT;' && failCommit) throw failCommit
    return { rows: [] }
  }
  const transaction = async (fn: (tx: Transaction) => Promise<void>) => {
    executeSync('BEGIN TRANSACTION;')
    try {
      await fn({
        execute: async (query: string) => executeSync(query),
      } as unknown as Transaction)
      executeSync('COMMIT;')
    } catch (err) {
      executeSync('ROLLBACK;')
      throw err
    }
  }
  return { db: { transaction } as unknown as DB, statements }
}

describe('TransactionQueue', () => {
  it('commits a write and resolves after the commit', async () => {
    const { db, statements } = makeDb()
    const queue = new TransactionQueue(db)

    await queue.push(async (tx) => {
      await tx.execute('INSERT INTO docs VALUES (1)')
    })

    expect(statements).toEqual([
      'BEGIN TRANSACTION;',
      'INSERT INTO docs VALUES (1)',
      'COMMIT;',
    ])
  })

  it('rolls back and rejects when the write throws', async () => {
    const { db, statements } = makeDb()
    const queue = new TransactionQueue(db)
    const failure = new Error('constraint failed')

    await expect(
      queue.push(async (tx) => {
        await tx.execute('INSERT INTO docs VALUES (1)')
        throw failure
      })
    ).rejects.toBe(failure)

    expect(statements).toEqual([
      'BEGIN TRANSACTION;',
      'INSERT INTO docs VALUES (1)',
      'ROLLBACK;',
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
    const next = queue.push(async (tx) => {
      await tx.execute('INSERT INTO docs VALUES (2)')
    })

    await expect(failed).rejects.toThrow('constraint failed')
    await next
    expect(statements.slice(-3)).toEqual([
      'BEGIN TRANSACTION;',
      'INSERT INTO docs VALUES (2)',
      'COMMIT;',
    ])
  })
})

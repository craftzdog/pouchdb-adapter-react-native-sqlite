import type { DB } from '@op-engineering/op-sqlite'
import { TransactionQueue } from '../transactionQueue'

const makeDb = (execute: jest.Mock = jest.fn(async () => ({ rows: [] }))) => {
  const transaction = jest.fn(async (fn: (tx: any) => Promise<void>) => {
    await fn({ execute })
  })
  return { db: { execute, transaction } as unknown as DB, execute, transaction }
}

const statements = (execute: jest.Mock) =>
  execute.mock.calls.map((call) => call[0])

describe('TransactionQueue', () => {
  it('takes the write lock before a write transaction runs', async () => {
    const { db, execute, transaction } = makeDb()
    const queue = new TransactionQueue(db)

    await queue.push(async (tx) => {
      await tx.execute('SELECT 1')
      await tx.execute('INSERT INTO docs VALUES (?)', ['a'])
    })

    expect(statements(execute)).toEqual([
      'BEGIN IMMEDIATE',
      'SELECT 1',
      'INSERT INTO docs VALUES (?)',
      'COMMIT',
    ])
    expect(execute).toHaveBeenCalledWith('INSERT INTO docs VALUES (?)', ['a'])
    expect(transaction).not.toHaveBeenCalled()
  })

  it('rejects the write when the lock cannot be taken', async () => {
    const locked = new Error('database is locked')
    const { db, execute } = makeDb(jest.fn().mockRejectedValueOnce(locked))
    const queue = new TransactionQueue(db)
    const fn = jest.fn()

    await expect(queue.push(fn)).rejects.toBe(locked)

    expect(fn).not.toHaveBeenCalled()
    expect(statements(execute)).toEqual(['BEGIN IMMEDIATE'])
  })

  it('runs the next transaction after a write that could not start', async () => {
    const { db, execute } = makeDb(
      jest
        .fn()
        .mockRejectedValueOnce(new Error('database is locked'))
        .mockResolvedValue({ rows: [] })
    )
    const queue = new TransactionQueue(db)

    await expect(queue.push(jest.fn())).rejects.toThrow('database is locked')
    await queue.push(async (tx) => {
      await tx.execute('INSERT INTO docs VALUES (?)', ['b'])
    })

    expect(statements(execute)).toEqual([
      'BEGIN IMMEDIATE',
      'BEGIN IMMEDIATE',
      'INSERT INTO docs VALUES (?)',
      'COMMIT',
    ])
  })

  it('rolls back and rejects when the commit fails', async () => {
    const full = new Error('database or disk is full')
    const execute = jest.fn(async (query: string) => {
      if (query === 'COMMIT') throw full
      return { rows: [] }
    })
    const { db } = makeDb(execute)
    const queue = new TransactionQueue(db)
    const settled = jest.fn()

    await queue.push(async () => {}).then(settled, settled)
    await new Promise((resolve) => setImmediate(resolve))

    expect(statements(execute)).toEqual([
      'BEGIN IMMEDIATE',
      'COMMIT',
      'ROLLBACK',
    ])
  })

  it('keeps read transactions on a plain transaction', async () => {
    const { db, execute, transaction } = makeDb()
    const queue = new TransactionQueue(db)

    await queue.pushReadOnly(async (tx) => {
      await tx.execute('SELECT 1')
    })

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(statements(execute)).toEqual(['SELECT 1'])
  })
})

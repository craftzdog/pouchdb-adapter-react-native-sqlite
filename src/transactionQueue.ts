import type { DB, Transaction } from '@op-engineering/op-sqlite'
import { logger } from './debug'

export interface PendingTransaction {
  readonly: boolean
  start: (tx: Transaction) => Promise<void>
  fail?: (err: unknown) => void
  finish: () => void
}

export class TransactionQueue {
  queue: PendingTransaction[] = []
  inProgress = false
  db: DB

  constructor(db: DB) {
    this.db = db
  }

  run() {
    if (this.inProgress) {
      // Transaction is already in process bail out
      return
    }

    if (this.queue.length) {
      this.inProgress = true
      const tx = this.queue.shift()

      if (!tx) {
        throw new Error('Could not get a operation on database')
      }

      setImmediate(async () => {
        try {
          if (tx.readonly) {
            logger.debug('---> transaction start!')
            await this.db.transaction(tx.start)
            // await tx.start({
            //   commit: async () => {return { rowsAffected: 0 }},
            //   execute: this.db.execute.bind(this.db),
            //   rollback: async () => {return { rowsAffected: 0 }},
            // })
          } else {
            logger.debug('---> write transaction start!')
            await this.runWrite(tx)
          }
        } finally {
          logger.debug(
            '<--- transaction finished! queue.length:',
            this.queue.length
          )
          tx.finish()
          this.inProgress = false
          if (this.queue.length) this.run()
        }
      })
    } else {
      this.inProgress = false
    }
  }

  // A write transaction takes the write lock as it begins. Started deferred,
  // it would read first, and SQLite refuses the write that follows at once
  // (SQLITE_BUSY_SNAPSHOT, whatever the busy timeout) when another connection
  // has committed in between.
  private async runWrite(tx: PendingTransaction) {
    try {
      await this.db.execute('BEGIN IMMEDIATE')
    } catch (err) {
      tx.fail?.(err)
      return
    }
    try {
      await tx.start({
        execute: (query: string, params?: any[]) =>
          this.db.execute(query, params),
      } as Transaction)
      await this.db.execute('COMMIT')
    } catch (err) {
      try {
        await this.db.execute('ROLLBACK')
      } catch (rollbackError) {
        logger.debug('rollback failed', rollbackError)
      }
      tx.fail?.(err)
    }
  }

  async push(fn: (tx: Transaction) => Promise<void>) {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({
        readonly: false,
        start: (tx) => fn(tx).then(resolve, reject),
        fail: reject,
        finish: () => {},
      })
      this.run()
    })
  }

  async pushReadOnly(fn: (tx: Transaction) => Promise<void>) {
    return new Promise<void>((resolve, reject) => {
      const pending: PendingTransaction = {
        readonly: true,
        start: (tx) => fn(tx).then(resolve, reject),
        finish: () => {},
      }
      const firstWrite = this.queue.findIndex((tx) => !tx.readonly)
      const insertAt = firstWrite === -1 ? this.queue.length : firstWrite
      this.queue.splice(insertAt, 0, pending)
      this.run()
    })
  }
}

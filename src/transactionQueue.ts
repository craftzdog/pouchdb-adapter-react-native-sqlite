import type { DB, Transaction } from '@op-engineering/op-sqlite'
import { META_STORE } from './constants'
import { logger } from './debug'

const TAKE_WRITE_LOCK = 'UPDATE ' + META_STORE + ' SET dbid = dbid'

export interface PendingTransaction {
  readonly: boolean
  fn: (tx: Transaction) => Promise<void>
  resolve: () => void
  reject: (err: unknown) => void
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
            await this.db.transaction(tx.fn)
            // await tx.start({
            //   commit: async () => {return { rowsAffected: 0 }},
            //   execute: this.db.execute.bind(this.db),
            //   rollback: async () => {return { rowsAffected: 0 }},
            // })
          } else {
            logger.debug('---> write transaction start!')
            await this.db.transaction(async (sqlTx) => {
              // A write as the first statement makes SQLite take the write
              // lock now, under busy_timeout, instead of upgrading a read
              // snapshot that another connection may have made stale.
              await sqlTx.execute(TAKE_WRITE_LOCK)
              await tx.fn(sqlTx)
            })
          }
          tx.resolve()
        } catch (err) {
          tx.reject(err)
        } finally {
          logger.debug(
            '<--- transaction finished! queue.length:',
            this.queue.length
          )
          this.inProgress = false
          if (this.queue.length) this.run()
        }
      })
    } else {
      this.inProgress = false
    }
  }

  async push(fn: (tx: Transaction) => Promise<void>) {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ readonly: false, fn, resolve, reject })
      this.run()
    })
  }

  async pushReadOnly(fn: (tx: Transaction) => Promise<void>) {
    return new Promise<void>((resolve, reject) => {
      const pending: PendingTransaction = {
        readonly: true,
        fn,
        resolve,
        reject,
      }
      const firstWrite = this.queue.findIndex((tx) => !tx.readonly)
      const insertAt = firstWrite === -1 ? this.queue.length : firstWrite
      this.queue.splice(insertAt, 0, pending)
      this.run()
    })
  }
}

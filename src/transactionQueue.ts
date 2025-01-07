import type { DB, Transaction } from '@op-engineering/op-sqlite'
import { logger } from './debug'

export interface PendingTransaction {
  readonly: boolean
  start: (tx: Transaction) => Promise<void>
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
            await this.db.transaction(tx.start)
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

  async push(fn: (tx: Transaction) => Promise<void>) {
    return new Promise<void>((resolve) => {
      this.queue.push({ readonly: false, start: fn, finish: resolve })
      this.run()
    })
  }

  async pushReadOnly(fn: (tx: Transaction) => Promise<void>) {
    return new Promise<void>((resolve) => {
      this.queue.push({ readonly: true, start: fn, finish: resolve })
      this.run()
    })
  }
}

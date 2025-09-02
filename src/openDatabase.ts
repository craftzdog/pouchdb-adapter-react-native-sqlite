import { open } from '@op-engineering/op-sqlite'
import { TransactionQueue } from './transactionQueue'
import type { DB } from '@op-engineering/op-sqlite'

type SQLiteOpenParams = Parameters<typeof open>
export type OpenDatabaseOptions = SQLiteOpenParams[0] & {
  revs_limit?: number
  deterministic_revs?: boolean
}
type OpenDatabaseResult =
  | {
      db: DB
      transactionQueue: TransactionQueue
    }
  | {
      error: Error
    }

const cachedDatabases = new Map<string, OpenDatabaseResult>()

function openDBSafely(opts: OpenDatabaseOptions): OpenDatabaseResult {
  try {
    const db = open(opts)
    const transactionQueue = new TransactionQueue(db)
    return { db, transactionQueue }
  } catch (err: any) {
    return { error: err }
  }
}

function openDB(opts: OpenDatabaseOptions) {
  let cachedResult: OpenDatabaseResult | undefined = cachedDatabases.get(
    opts.name
  )
  if (!cachedResult) {
    cachedResult = openDBSafely(opts)
    cachedDatabases.set(opts.name, cachedResult)
  }
  return cachedResult
}

export function closeDB(name: string) {
  const cachedResult = cachedDatabases.get(name)
  if (cachedResult) {
    if ('db' in cachedResult) {
      cachedResult.db.close()
    }
    cachedDatabases.delete(name)
  }
}

export default openDB

import { open } from '@op-engineering/op-sqlite'
import type { DB } from '@op-engineering/op-sqlite'

import { TransactionQueue } from './transactionQueue'

const PAGE_CACHE_SIZE_KIB = 16_000

type SQLiteOpenParams = Parameters<typeof open>
export type OpenDatabaseOptions = SQLiteOpenParams[0] & {
  revs_limit?: number
  deterministic_revs?: boolean
  onOpen?: (db: DB) => void
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
  const { onOpen, ...sqliteOpts } = opts
  let db: DB | undefined
  try {
    db = open(sqliteOpts)
    db.executeSync('PRAGMA journal_mode = WAL')
    db.executeSync('PRAGMA synchronous = NORMAL')
    db.executeSync(`PRAGMA cache_size = -${PAGE_CACHE_SIZE_KIB}`)
    onOpen?.(db)
    const transactionQueue = new TransactionQueue(db)
    return { db, transactionQueue }
  } catch (err: any) {
    try {
      db?.close()
    } catch {}
    return { error: err }
  }
}

function openDB(opts: OpenDatabaseOptions) {
  let cachedResult: OpenDatabaseResult | undefined = cachedDatabases.get(opts.name)
  if (!cachedResult) {
    cachedResult = openDBSafely(opts)
    if ('db' in cachedResult) {
      cachedDatabases.set(opts.name, cachedResult)
    }
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

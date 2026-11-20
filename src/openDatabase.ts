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
type OpenDatabase = {
  db: DB
  transactionQueue: TransactionQueue
}
type OpenDatabaseResult = OpenDatabase | { error: Error }

/** The open connections by file name, with how many PouchDB instances use each. */
const openDatabases = new Map<string, OpenDatabase & { openCount: number }>()

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
  } catch (error: any) {
    try {
      db?.close()
    } catch {}
    return { error }
  }
}

function openDB(opts: OpenDatabaseOptions): OpenDatabaseResult {
  const openDatabase = openDatabases.get(opts.name)
  if (openDatabase) {
    openDatabases.set(opts.name, { ...openDatabase, openCount: openDatabase.openCount + 1 })
    return openDatabase
  }
  const result = openDBSafely(opts)
  if ('db' in result) {
    openDatabases.set(opts.name, { ...result, openCount: 1 })
  }
  return result
}

/** Releases one use of the connection, and closes it when no PouchDB instance uses it anymore. */
export function closeDB(name: string) {
  const openDatabase = openDatabases.get(name)
  if (!openDatabase) {
    return
  }
  if (openDatabase.openCount > 1) {
    openDatabases.set(name, { ...openDatabase, openCount: openDatabase.openCount - 1 })
    return
  }
  openDatabase.db.close()
  openDatabases.delete(name)
}

export default openDB

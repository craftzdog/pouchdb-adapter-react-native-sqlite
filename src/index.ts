import SqlPouchCore from './core'
import type { OpenDatabaseOptions } from './openDatabase'

function ReactNativeSQLitePouch(
  this: unknown,
  opts: OpenDatabaseOptions,
  callback: (err: any) => void
) {
  try {
    SqlPouchCore.call(this, opts, callback)
  } catch (error) {
    callback(error)
  }
}

ReactNativeSQLitePouch.valid = function () {
  return true
}
ReactNativeSQLitePouch.use_prefix = false

export default function reactNativeSqlitePlugin(PouchDB: any) {
  PouchDB.adapter('react-native-sqlite', ReactNativeSQLitePouch, true)
}

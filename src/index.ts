import SqlPouchCore from './core'
import type { OpenDatabaseOptions } from './openDatabase'

function ReactNativeSQLitePouch(
  opts: OpenDatabaseOptions,
  callback: (err: any) => void
) {
  try {
    // @ts-ignore
    SqlPouchCore.call(this, opts, callback)
  } catch (err) {
    callback(err)
  }
}

// Set static properties
ReactNativeSQLitePouch.valid = function () {
  return true
}
ReactNativeSQLitePouch.use_prefix = false

export default function reactNativeSqlitePlugin(PouchDB: any) {
  PouchDB.adapter('react-native-sqlite', ReactNativeSQLitePouch, true)
}

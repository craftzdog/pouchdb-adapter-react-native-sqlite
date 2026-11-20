import HttpPouch from 'pouchdb-adapter-http'
import sqliteAdapter from 'pouchdb-adapter-react-native-sqlite'
import PouchDB from 'pouchdb-core'
import mapreduce from 'pouchdb-mapreduce'
import replication from 'pouchdb-replication'

export default PouchDB.plugin(HttpPouch).plugin(replication).plugin(mapreduce).plugin(sqliteAdapter)

'use strict'

const SQLite = require('react-native-sqlite-storage')
const SQLiteAdapterFactory = require('../lib/')
const SQLiteAdapter = SQLiteAdapterFactory(SQLite)

const PouchDB = require('pouchdb-core')
const HttpPouch = require('pouchdb-adapter-http')
const mapreduce = require('pouchdb-mapreduce')
const replication = require('pouchdb-replication')

PouchDB
  .plugin(SQLiteAdapter)
  .plugin(HttpPouch)
  .plugin(mapreduce)
  .plugin(replication)

PouchDB.utils = require('pouchdb-utils')

module.exports = PouchDB

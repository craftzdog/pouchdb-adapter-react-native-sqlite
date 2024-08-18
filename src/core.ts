import {
  clone,
  pick,
  filterChange,
  changesHandler as Changes,
  uuid,
} from 'pouchdb-utils'
import {
  collectConflicts,
  traverseRevTree,
  latest as getLatest,
} from 'pouchdb-merge'
import { safeJsonParse, safeJsonStringify } from 'pouchdb-json'
import {
  binaryStringToBlobOrBuffer as binStringToBlob,
  btoa,
} from 'pouchdb-binary-utils'

import sqliteBulkDocs from './bulkDocs'

import { MISSING_DOC, REV_CONFLICT, createError } from 'pouchdb-errors'

import {
  ADAPTER_VERSION,
  DOC_STORE,
  BY_SEQ_STORE,
  ATTACH_STORE,
  LOCAL_STORE,
  META_STORE,
  ATTACH_AND_SEQ_STORE,
} from './constants'

import {
  qMarks,
  stringifyDoc,
  unstringifyDoc,
  select,
  compactRevs,
  handleSQLiteError,
} from './utils'

import openDB, { closeDB, type OpenDatabaseOptions } from './openDatabase'
import type { DB, Transaction } from '@op-engineering/op-sqlite'
import type { TransactionQueue } from './transactionQueue'
import { logger } from './debug'

// these indexes cover the ground for most allDocs queries
const BY_SEQ_STORE_DELETED_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS 'by-seq-deleted-idx' ON " +
  BY_SEQ_STORE +
  ' (seq, deleted)'
const BY_SEQ_STORE_DOC_ID_REV_INDEX_SQL =
  "CREATE UNIQUE INDEX IF NOT EXISTS 'by-seq-doc-id-rev' ON " +
  BY_SEQ_STORE +
  ' (doc_id, rev)'
const DOC_STORE_WINNINGSEQ_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS 'doc-winningseq-idx' ON " +
  DOC_STORE +
  ' (winningseq)'
const ATTACH_AND_SEQ_STORE_SEQ_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS 'attach-seq-seq-idx' ON " +
  ATTACH_AND_SEQ_STORE +
  ' (seq)'
const ATTACH_AND_SEQ_STORE_ATTACH_INDEX_SQL =
  "CREATE UNIQUE INDEX IF NOT EXISTS 'attach-seq-digest-idx' ON " +
  ATTACH_AND_SEQ_STORE +
  ' (digest, seq)'

const DOC_STORE_AND_BY_SEQ_JOINER =
  BY_SEQ_STORE + '.seq = ' + DOC_STORE + '.winningseq'

const SELECT_DOCS =
  BY_SEQ_STORE +
  '.seq AS seq, ' +
  BY_SEQ_STORE +
  '.deleted AS deleted, ' +
  BY_SEQ_STORE +
  '.json AS data, ' +
  BY_SEQ_STORE +
  '.rev AS rev, ' +
  DOC_STORE +
  '.json AS metadata'

const sqliteChanges = new Changes()

function SqlPouch(opts: OpenDatabaseOptions, cb: (err: any) => void) {
  // @ts-ignore
  let api = this as any
  let db: DB
  // @ts-ignore
  let txnQueue: TransactionQueue
  let instanceId: string
  let encoding: string = 'UTF-8'
  api.auto_compaction = false

  api._name = opts.name
  logger.debug('Creating SqlPouch instance: %s', api._name)

  const sqlOpts = Object.assign({}, opts, { name: opts.name + '.sqlite' })
  const openDBResult = openDB(sqlOpts)
  if ('db' in openDBResult) {
    db = openDBResult.db
    txnQueue = openDBResult.transactionQueue
    setup(cb)
    logger.debug('Database was opened successfully.', db.getDbPath())
  } else {
    handleSQLiteError(openDBResult.error, cb)
  }

  async function transaction(fn: (tx: Transaction) => Promise<void>) {
    return txnQueue.push(fn)
  }

  async function readTransaction(fn: (tx: Transaction) => Promise<void>) {
    return txnQueue.pushReadOnly(fn)
  }

  async function setup(callback: (err: any) => void) {
    await db.transaction(async (tx) => {
      checkEncoding(tx)
      fetchVersion(tx)
    })
    callback(null)
  }

  function checkEncoding(tx: Transaction) {
    const res = tx.execute('SELECT HEX("a") AS hex')
    const hex = res.rows?.item(0).hex
    encoding = hex.length === 2 ? 'UTF-8' : 'UTF-16'
  }

  function fetchVersion(tx: Transaction) {
    const sql = 'SELECT sql FROM sqlite_master WHERE tbl_name = ' + META_STORE
    const result = tx.execute(sql, [])
    if (!result.rows?.length) {
      onGetVersion(tx, 0)
    } else if (!/db_version/.test(result.rows.item(0).sql)) {
      tx.execute('ALTER TABLE ' + META_STORE + ' ADD COLUMN db_version INTEGER')
      onGetVersion(tx, 1)
    } else {
      const resDBVer = tx.execute('SELECT db_version FROM ' + META_STORE)
      const dbVersion = resDBVer.rows?.item(0).db_version
      onGetVersion(tx, dbVersion)
    }
  }

  function onGetVersion(tx: Transaction, dbVersion: number) {
    if (dbVersion === 0) {
      createInitialSchema(tx)
    } else {
      runMigrations(tx, dbVersion)
    }
  }

  function createInitialSchema(tx: Transaction) {
    const meta =
      'CREATE TABLE IF NOT EXISTS ' + META_STORE + ' (dbid, db_version INTEGER)'
    const attach =
      'CREATE TABLE IF NOT EXISTS ' +
      ATTACH_STORE +
      ' (digest UNIQUE, escaped TINYINT(1), body BLOB)'
    const attachAndRev =
      'CREATE TABLE IF NOT EXISTS ' +
      ATTACH_AND_SEQ_STORE +
      ' (digest, seq INTEGER)'
    const doc =
      'CREATE TABLE IF NOT EXISTS ' +
      DOC_STORE +
      ' (id unique, json, winningseq, max_seq INTEGER UNIQUE)'
    const seq =
      'CREATE TABLE IF NOT EXISTS ' +
      BY_SEQ_STORE +
      ' (seq INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, json, deleted TINYINT(1), doc_id, rev)'
    const local =
      'CREATE TABLE IF NOT EXISTS ' + LOCAL_STORE + ' (id UNIQUE, rev, json)'

    tx.execute(attach)
    tx.execute(local)
    tx.execute(attachAndRev)
    tx.execute(ATTACH_AND_SEQ_STORE_SEQ_INDEX_SQL)
    tx.execute(ATTACH_AND_SEQ_STORE_ATTACH_INDEX_SQL)
    tx.execute(doc)
    tx.execute(DOC_STORE_WINNINGSEQ_INDEX_SQL)
    tx.execute(seq)
    tx.execute(BY_SEQ_STORE_DELETED_INDEX_SQL)
    tx.execute(BY_SEQ_STORE_DOC_ID_REV_INDEX_SQL)
    tx.execute(meta)
    const initSeq =
      'INSERT INTO ' + META_STORE + ' (db_version, dbid) VALUES (?,?)'
    instanceId = uuid()
    const initSeqArgs = [ADAPTER_VERSION, instanceId]
    tx.execute(initSeq, initSeqArgs)
    onGetInstanceId()
  }

  async function runMigrations(tx: Transaction, dbVersion: number) {
    // const tasks = [setupDone]
    //
    // let i = dbVersion
    // const nextMigration = (tx: Transaction) => {
    //   tasks[i - 1](tx, nextMigration)
    //   i++
    // }
    // nextMigration(tx)

    const migrated = dbVersion < ADAPTER_VERSION
    if (migrated) {
      db.execute(
        'UPDATE ' + META_STORE + ' SET db_version = ' + ADAPTER_VERSION
      )
    }
    const result = db.execute('SELECT dbid FROM ' + META_STORE)
    instanceId = result.rows?.item(0).dbid
    onGetInstanceId()
  }

  function onGetInstanceId() {
    // Do nothing
  }

  api._remote = false

  api._id = (callback: (err: any, id?: string) => void) => {
    callback(null, instanceId)
  }

  api._info = (callback: (err: any, info?: any) => void) => {
    readTransaction(async (tx: Transaction) => {
      try {
        const seq = await getMaxSeq(tx)
        const docCount = await countDocs(tx)
        callback(null, {
          doc_count: docCount,
          update_seq: seq,
          sqlite_encoding: encoding,
        })
      } catch (e: any) {
        handleSQLiteError(e, callback)
      }
    })
  }

  api._bulkDocs = (
    req: any,
    reqOpts: any,
    callback: (err: any, response?: any) => void
  ) => {
    logger.debug('**********bulkDocs!!!!!!!!!!!!!!!!!!!')
    sqliteBulkDocs(
      { revs_limit: undefined },
      req,
      reqOpts,
      api,
      transaction,
      sqliteChanges,
      callback
    )
  }

  api._get = (
    id: string,
    opts: any,
    callback: (err: any, response?: any) => void
  ) => {
    logger.debug('get:', id)
    let doc: any
    let metadata: any
    const tx: Transaction = opts.ctx
    if (!tx) {
      readTransaction(async (txn) => {
        return new Promise((resolve) => {
          api._get(
            id,
            Object.assign({ ctx: txn }, opts),
            (err: any, response: any) => {
              callback(err, response)
              resolve()
            }
          )
        })
      })
      return
    }

    const finish = (err: any) => {
      callback(err, { doc, metadata, ctx: tx })
    }

    let sql: string
    let sqlArgs: any[]

    if (!opts.rev) {
      sql = select(
        SELECT_DOCS,
        [DOC_STORE, BY_SEQ_STORE],
        DOC_STORE_AND_BY_SEQ_JOINER,
        DOC_STORE + '.id=?'
      )
      sqlArgs = [id]
    } else if (opts.latest) {
      latest(
        tx,
        id,
        opts.rev,
        (latestRev: string) => {
          opts.latest = false
          opts.rev = latestRev
          api._get(id, opts, callback)
        },
        finish
      )
      return
    } else {
      sql = select(
        SELECT_DOCS,
        [DOC_STORE, BY_SEQ_STORE],
        DOC_STORE + '.id=' + BY_SEQ_STORE + '.doc_id',
        [BY_SEQ_STORE + '.doc_id=?', BY_SEQ_STORE + '.rev=?']
      )
      sqlArgs = [id, opts.rev]
    }

    tx.executeAsync(sql, sqlArgs).then((results) => {
      if (!results.rows?.length) {
        const missingErr = createError(MISSING_DOC, 'missing')
        return finish(missingErr)
      }
      const item = results.rows.item(0)
      metadata = safeJsonParse(item.metadata)
      if (item.deleted && !opts.rev) {
        const deletedErr = createError(MISSING_DOC, 'deleted')
        return finish(deletedErr)
      }
      doc = unstringifyDoc(item.data, metadata.id, item.rev)
      finish(null)
    })
  }

  api._allDocs = (opts: any, callback: (err: any, response?: any) => void) => {
    const results: any[] = []

    const start = 'startkey' in opts ? opts.startkey : false
    const end = 'endkey' in opts ? opts.endkey : false
    const key = 'key' in opts ? opts.key : false
    const keys = 'keys' in opts ? opts.keys : false
    const descending = 'descending' in opts ? opts.descending : false
    let limit = 'limit' in opts ? opts.limit : -1
    const offset = 'skip' in opts ? opts.skip : 0
    const inclusiveEnd = opts.inclusive_end !== false

    let sqlArgs: any[] = []
    const criteria: string[] = []
    const keyChunks: any[] = []

    if (keys) {
      const destinctKeys: string[] = []
      keys.forEach((key: string) => {
        if (destinctKeys.indexOf(key) === -1) {
          destinctKeys.push(key)
        }
      })

      for (let index = 0; index < destinctKeys.length; index += 999) {
        const chunk = destinctKeys.slice(index, index + 999)
        if (chunk.length > 0) {
          keyChunks.push(chunk)
        }
      }
    } else if (key !== false) {
      criteria.push(DOC_STORE + '.id = ?')
      sqlArgs.push(key)
    } else if (start !== false || end !== false) {
      if (start !== false) {
        criteria.push(DOC_STORE + '.id ' + (descending ? '<=' : '>=') + ' ?')
        sqlArgs.push(start)
      }
      if (end !== false) {
        let comparator = descending ? '>' : '<'
        if (inclusiveEnd) {
          comparator += '='
        }
        criteria.push(DOC_STORE + '.id ' + comparator + ' ?')
        sqlArgs.push(end)
      }
      if (key !== false) {
        criteria.push(DOC_STORE + '.id = ?')
        sqlArgs.push(key)
      }
    }

    if (!keys) {
      criteria.push(BY_SEQ_STORE + '.deleted = 0')
    }

    readTransaction(async (tx: Transaction) => {
      const processResult = (rows: any[], results: any[], keys: any) => {
        for (let i = 0, l = rows.length; i < l; i++) {
          const item = rows[i]
          const metadata = safeJsonParse(item.metadata)
          const id = metadata.id
          const data = unstringifyDoc(item.data, id, item.rev)
          const winningRev = data._rev
          const doc: any = {
            id: id,
            key: id,
            value: { rev: winningRev },
          }
          if (opts.include_docs) {
            doc.doc = data
            doc.doc._rev = winningRev
            if (opts.conflicts) {
              const conflicts = collectConflicts(metadata)
              if (conflicts.length) {
                doc.doc._conflicts = conflicts
              }
            }
            fetchAttachmentsIfNecessary(doc.doc, opts, api, tx)
          }
          if (item.deleted) {
            if (keys) {
              doc.value.deleted = true
              doc.doc = null
            } else {
              continue
            }
          }
          if (!keys) {
            results.push(doc)
          } else {
            let index = keys.indexOf(id)
            do {
              results[index] = doc
              index = keys.indexOf(id, index + 1)
            } while (index > -1 && index < keys.length)
          }
        }
        if (keys) {
          keys.forEach((key: string, index: number) => {
            if (!results[index]) {
              results[index] = { key: key, error: 'not_found' }
            }
          })
        }
      }

      try {
        const totalRows = await countDocs(tx)
        const updateSeq = opts.update_seq ? await getMaxSeq(tx) : undefined

        if (limit === 0) {
          limit = 1
        }

        if (keys) {
          let finishedCount = 0
          const allRows: any[] = []
          for (const keyChunk of keyChunks) {
            sqlArgs = []
            criteria.length = 0
            let bindingStr = ''
            keyChunk.forEach(() => {
              bindingStr += '?,'
            })
            bindingStr = bindingStr.substring(0, bindingStr.length - 1)
            criteria.push(DOC_STORE + '.id IN (' + bindingStr + ')')
            sqlArgs = sqlArgs.concat(keyChunk)

            const sql =
              select(
                SELECT_DOCS,
                [DOC_STORE, BY_SEQ_STORE],
                DOC_STORE_AND_BY_SEQ_JOINER,
                criteria,
                DOC_STORE + '.id ' + (descending ? 'DESC' : 'ASC')
              ) +
              ' LIMIT ' +
              limit +
              ' OFFSET ' +
              offset
            const result = await tx.executeAsync(sql, sqlArgs)
            finishedCount++
            if (result.rows) {
              for (let index = 0; index < result.rows.length; index++) {
                allRows.push(result.rows?.item(index))
              }
            }
            if (finishedCount === keyChunks.length) {
              processResult(allRows, results, keys)
            }
          }
        } else {
          const sql =
            select(
              SELECT_DOCS,
              [DOC_STORE, BY_SEQ_STORE],
              DOC_STORE_AND_BY_SEQ_JOINER,
              criteria,
              DOC_STORE + '.id ' + (descending ? 'DESC' : 'ASC')
            ) +
            ' LIMIT ' +
            limit +
            ' OFFSET ' +
            offset
          const result = await tx.executeAsync(sql, sqlArgs)
          const rows: any[] = []
          if (result.rows) {
            for (let index = 0; index < result.rows.length; index++) {
              rows.push(result.rows.item(index))
            }
          }
          processResult(rows, results, keys)
        }

        const returnVal: any = {
          total_rows: totalRows,
          offset: opts.skip,
          rows: results,
        }

        if (opts.update_seq) {
          returnVal.update_seq = updateSeq
        }
        callback(null, returnVal)
      } catch (e: any) {
        handleSQLiteError(e, callback)
      }
    })
  }

  api._changes = (opts: any): any => {
    opts = clone(opts)

    if (opts.continuous) {
      const id = api._name + ':' + uuid()
      sqliteChanges.addListener(api._name, id, api, opts)
      sqliteChanges.notify(api._name)
      return {
        cancel: () => {
          sqliteChanges.removeListener(api._name, id)
        },
      }
    }

    const descending = opts.descending
    opts.since = opts.since && !descending ? opts.since : 0
    let limit = 'limit' in opts ? opts.limit : -1
    if (limit === 0) {
      limit = 1
    }

    const results: any[] = []
    let numResults = 0

    const fetchChanges = () => {
      const selectStmt =
        DOC_STORE +
        '.json AS metadata, ' +
        DOC_STORE +
        '.max_seq AS maxSeq, ' +
        BY_SEQ_STORE +
        '.json AS winningDoc, ' +
        BY_SEQ_STORE +
        '.rev AS winningRev '
      const from = DOC_STORE + ' JOIN ' + BY_SEQ_STORE
      const joiner =
        DOC_STORE +
        '.id=' +
        BY_SEQ_STORE +
        '.doc_id' +
        ' AND ' +
        DOC_STORE +
        '.winningseq=' +
        BY_SEQ_STORE +
        '.seq'
      const criteria = ['maxSeq > ?']
      const sqlArgs = [opts.since]

      if (opts.doc_ids) {
        criteria.push(DOC_STORE + '.id IN ' + qMarks(opts.doc_ids.length))
        sqlArgs.push(...opts.doc_ids)
      }

      const orderBy = 'maxSeq ' + (descending ? 'DESC' : 'ASC')
      let sql = select(selectStmt, from, joiner, criteria, orderBy)
      const filter = filterChange(opts)

      if (!opts.view && !opts.filter) {
        sql += ' LIMIT ' + limit
      }

      let lastSeq = opts.since || 0
      readTransaction(async (tx: Transaction) => {
        try {
          const result = await tx.executeAsync(sql, sqlArgs)

          if (result.rows) {
            for (let i = 0, l = result.rows.length; i < l; i++) {
              const item = result.rows.item(i)
              const metadata = safeJsonParse(item.metadata)
              lastSeq = item.maxSeq

              const doc = unstringifyDoc(
                item.winningDoc,
                metadata.id,
                item.winningRev
              )
              const change = opts.processChange(doc, metadata, opts)
              change.seq = item.maxSeq

              const filtered = filter(change)
              if (typeof filtered === 'object') {
                return opts.complete(filtered)
              }

              if (filtered) {
                numResults++
                if (opts.return_docs) {
                  results.push(change)
                }
                if (opts.attachments && opts.include_docs) {
                  fetchAttachmentsIfNecessary(doc, opts, api, tx, () =>
                    opts.onChange(change)
                  )
                } else {
                  opts.onChange(change)
                }
              }
              if (numResults === limit) {
                break
              }
            }
          }

          if (!opts.continuous) {
            opts.complete(null, {
              results,
              last_seq: lastSeq,
            })
          }
        } catch (e: any) {
          handleSQLiteError(e, opts.complete)
        }
      })
    }

    fetchChanges()
  }

  api._close = (callback: (err?: any) => void) => {
    closeDB(api._name)
    callback()
  }

  api._getAttachment = (
    docId: string,
    attachId: string,
    attachment: any,
    opts: any,
    callback: (err: any, response?: any) => void
  ) => {
    let res: any
    const tx: Transaction = opts.ctx
    const digest = attachment.digest
    const type = attachment.content_type
    const sql =
      'SELECT escaped, body AS body FROM ' + ATTACH_STORE + ' WHERE digest=?'
    tx.executeAsync(sql, [digest]).then((result) => {
      const item = result.rows?.item(0)
      const data = item.body
      if (opts.binary) {
        res = binStringToBlob(data, type)
      } else {
        res = btoa(data)
      }
      callback(null, res)
    })
  }

  api._getRevisionTree = (
    docId: string,
    callback: (err: any, rev_tree?: any) => void
  ) => {
    readTransaction(async (tx: Transaction) => {
      const sql = 'SELECT json AS metadata FROM ' + DOC_STORE + ' WHERE id = ?'
      const result = await tx.executeAsync(sql, [docId])
      if (!result.rows?.length) {
        callback(createError(MISSING_DOC))
      } else {
        const data = safeJsonParse(result.rows?.item(0).metadata)
        callback(null, data.rev_tree)
      }
    })
  }

  api._doCompaction = (
    docId: string,
    revs: string[],
    callback: (err?: any) => void
  ) => {
    if (!revs.length) {
      return callback()
    }
    transaction(async (tx: Transaction) => {
      try {
        let sql = 'SELECT json AS metadata FROM ' + DOC_STORE + ' WHERE id = ?'
        const result = await tx.executeAsync(sql, [docId])
        const metadata = safeJsonParse(result.rows?.item(0).metadata)
        traverseRevTree(
          metadata.rev_tree,
          (
            isLeaf: boolean,
            pos: number,
            revHash: string,
            ctx: Transaction,
            opts: any
          ) => {
            const rev = pos + '-' + revHash
            if (revs.indexOf(rev) !== -1) {
              opts.status = 'missing'
            }
          }
        )
        sql = 'UPDATE ' + DOC_STORE + ' SET json = ? WHERE id = ?'
        await tx.executeAsync(sql, [safeJsonStringify(metadata), docId])

        await compactRevs(revs, docId, tx)
      } catch (e: any) {
        handleSQLiteError(e, callback)
      }
      callback()
    })
  }

  api._getLocal = (id: string, callback: (err: any, doc?: any) => void) => {
    readTransaction(async (tx: Transaction) => {
      try {
        const sql = 'SELECT json, rev FROM ' + LOCAL_STORE + ' WHERE id=?'
        const res = await tx.executeAsync(sql, [id])
        if (res.rows?.length) {
          const item = res.rows.item(0)
          const doc = unstringifyDoc(item.json, id, item.rev)
          callback(null, doc)
        } else {
          callback(createError(MISSING_DOC))
        }
      } catch (e: any) {
        handleSQLiteError(e, callback)
      }
    })
  }

  api._putLocal = (
    doc: any,
    opts: any,
    callback: (err: any, response?: any) => void
  ) => {
    if (typeof opts === 'function') {
      callback = opts
      opts = {}
    }
    delete doc._revisions
    const oldRev = doc._rev
    const id = doc._id
    let newRev: string
    if (!oldRev) {
      newRev = doc._rev = '0-1'
    } else {
      newRev = doc._rev = '0-' + (parseInt(oldRev.split('-')[1], 10) + 1)
    }
    const json = stringifyDoc(doc)

    let ret: any
    const putLocal = async (tx: Transaction) => {
      try {
        let sql: string
        let values: any[]
        if (oldRev) {
          sql =
            'UPDATE ' + LOCAL_STORE + ' SET rev=?, json=? WHERE id=? AND rev=?'
          values = [newRev, json, id, oldRev]
        } else {
          sql = 'INSERT INTO ' + LOCAL_STORE + ' (id, rev, json) VALUES (?,?,?)'
          values = [id, newRev, json]
        }
        const res = await tx.executeAsync(sql, values)
        if (res.rowsAffected) {
          ret = { ok: true, id: id, rev: newRev }
          callback(null, ret)
        } else {
          callback(createError(REV_CONFLICT))
        }
      } catch (e: any) {
        handleSQLiteError(e, callback)
      }
    }

    if (opts.ctx) {
      putLocal(opts.ctx)
    } else {
      transaction(putLocal)
    }
  }

  api._removeLocal = (
    doc: any,
    opts: any,
    callback: (err: any, response?: any) => void
  ) => {
    if (typeof opts === 'function') {
      callback = opts
      opts = {}
    }
    let ret: any

    const removeLocal = async (tx: Transaction) => {
      try {
        const sql = 'DELETE FROM ' + LOCAL_STORE + ' WHERE id=? AND rev=?'
        const params = [doc._id, doc._rev]
        const res = await tx.executeAsync(sql, params)
        if (!res.rowsAffected) {
          return callback(createError(MISSING_DOC))
        }
        ret = { ok: true, id: doc._id, rev: '0-0' }
        if (opts.ctx) {
          callback(null, ret)
        }
      } catch (e: any) {
        handleSQLiteError(e, callback)
      }
    }

    if (opts.ctx) {
      removeLocal(opts.ctx)
    } else {
      transaction(removeLocal)
    }
  }

  api._destroy = (opts: any, callback: (err: any, response?: any) => void) => {
    sqliteChanges.removeAllListeners(api._name)
    transaction(async (tx: Transaction) => {
      try {
        const stores = [
          DOC_STORE,
          BY_SEQ_STORE,
          ATTACH_STORE,
          META_STORE,
          LOCAL_STORE,
          ATTACH_AND_SEQ_STORE,
        ]
        stores.forEach((store) => {
          tx.execute('DROP TABLE IF EXISTS ' + store, [])
        })
        callback(null, { ok: true })
      } catch (e: any) {
        handleSQLiteError(e, callback)
      }
    })
  }

  function fetchAttachmentsIfNecessary(
    doc: any,
    opts: any,
    api: any,
    txn: any,
    cb?: () => void
  ) {
    const attachments = Object.keys(doc._attachments || {})
    if (!attachments.length) {
      return cb && cb()
    }
    let numDone = 0

    const checkDone = () => {
      if (++numDone === attachments.length && cb) {
        cb()
      }
    }

    const fetchAttachment = (doc: any, att: string) => {
      const attObj = doc._attachments[att]
      const attOpts = { binary: opts.binary, ctx: txn }
      api._getAttachment(doc._id, att, attObj, attOpts, (_: any, data: any) => {
        doc._attachments[att] = Object.assign(
          pick(attObj, ['digest', 'content_type']),
          { data }
        )
        checkDone()
      })
    }

    attachments.forEach((att) => {
      if (opts.attachments && opts.include_docs) {
        fetchAttachment(doc, att)
      } else {
        doc._attachments[att].stub = true
        checkDone()
      }
    })
  }

  async function getMaxSeq(tx: Transaction): Promise<number> {
    const sql = 'SELECT MAX(seq) AS seq FROM ' + BY_SEQ_STORE
    const res = await tx.executeAsync(sql, [])
    const updateSeq = res.rows?.item(0).seq || 0
    return updateSeq
  }

  async function countDocs(tx: Transaction): Promise<number> {
    const sql = select(
      'COUNT(' + DOC_STORE + ".id) AS 'num'",
      [DOC_STORE, BY_SEQ_STORE],
      DOC_STORE_AND_BY_SEQ_JOINER,
      BY_SEQ_STORE + '.deleted=0'
    )
    const result = await tx.executeAsync(sql, [])
    return result.rows?.item(0).num || 0
  }

  async function latest(
    tx: Transaction,
    id: string,
    rev: string,
    callback: (latestRev: string) => void,
    finish: (err: any) => void
  ) {
    const sql = select(
      SELECT_DOCS,
      [DOC_STORE, BY_SEQ_STORE],
      DOC_STORE_AND_BY_SEQ_JOINER,
      DOC_STORE + '.id=?'
    )
    const sqlArgs = [id]

    const results = await tx.executeAsync(sql, sqlArgs)
    if (!results.rows?.length) {
      const err = createError(MISSING_DOC, 'missing')
      return finish(err)
    }
    const item = results.rows.item(0)
    const metadata = safeJsonParse(item.metadata)
    callback(getLatest(rev, metadata))
  }
}

export default SqlPouch

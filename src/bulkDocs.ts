import {
  preprocessAttachments,
  isLocalId,
  processDocs,
  parseDoc,
} from 'pouchdb-adapter-utils'
import { compactTree } from 'pouchdb-merge'
import { safeJsonParse, safeJsonStringify } from 'pouchdb-json'
import { MISSING_STUB, createError } from 'pouchdb-errors'

import {
  DOC_STORE,
  BY_SEQ_STORE,
  ATTACH_STORE,
  ATTACH_AND_SEQ_STORE,
} from './constants'

import { select, stringifyDoc, compactRevs, handleSQLiteError } from './utils'
import type { Transaction } from '@op-engineering/op-sqlite'
import { logger } from './debug'

interface DocInfo {
  _id: string
  metadata: any
  data: any
  stemmedRevs?: string[]
  error?: any
}

interface DBOptions {
  revs_limit?: number
}

interface Request {
  docs: any[]
}

interface Options {
  new_edits: boolean
}

type Callback = (err: any, result?: any) => void

function sqliteBulkDocs(
  dbOpts: DBOptions,
  req: Request,
  opts: Options,
  api: any,
  transaction: (fn: (tx: Transaction) => Promise<void>) => void,
  sqliteChanges: any,
  callback: Callback
) {
  const newEdits = opts.new_edits
  const userDocs = req.docs

  const docInfos: DocInfo[] = userDocs.map((doc) => {
    if (doc._id && isLocalId(doc._id)) {
      return doc
    }
    return parseDoc(doc, newEdits, dbOpts)
  })

  const docInfoErrors = docInfos.filter((docInfo) => docInfo.error)
  if (docInfoErrors.length) {
    return callback(docInfoErrors[0])
  }

  let tx: Transaction
  const results = new Array(docInfos.length)
  const fetchedDocs = new Map<string, any>()

  let preconditionErrored: any
  function complete() {
    if (preconditionErrored) {
      return callback(preconditionErrored)
    }
    sqliteChanges.notify(api._name)
    callback(null, results)
  }

  function verifyAttachment(digest: string, callback: (err?: any) => void) {
    logger.debug('verify attachment:', digest)
    const sql =
      'SELECT count(*) as cnt FROM ' + ATTACH_STORE + ' WHERE digest=?'
    tx.executeAsync(sql, [digest]).then((result) => {
      if (result.rows?.item(0).cnt === 0) {
        const err = createError(
          MISSING_STUB,
          'unknown stub attachment with digest ' + digest
        )
        logger.error('unknown:', err)
        callback(err)
      } else {
        logger.debug('ok')
        callback()
      }
    })
  }

  function verifyAttachments(): Promise<void> {
    return new Promise((resolve, reject) => {
      const digests: string[] = []
      docInfos.forEach((docInfo) => {
        if (docInfo.data && docInfo.data._attachments) {
          Object.keys(docInfo.data._attachments).forEach((filename) => {
            const att = docInfo.data._attachments[filename]
            if (att.stub) {
              logger.debug('attachment digest', att.digest)
              digests.push(att.digest)
            }
          })
        }
      })

      if (!digests.length) {
        return resolve()
      }

      let numDone = 0
      let err: any

      function checkDone() {
        if (++numDone === digests.length) {
          err ? reject(err) : resolve()
        }
      }

      digests.forEach((digest) => {
        verifyAttachment(digest, (attErr) => {
          if (attErr && !err) {
            err = attErr
          }
          checkDone()
        })
      })
    })
  }

  function writeDoc(
    docInfo: DocInfo,
    winningRev: string,
    winningRevIsDeleted: boolean,
    newRevIsDeleted: boolean,
    isUpdate: boolean,
    delta: number,
    resultsIdx: number,
    callback: (err?: any) => void
  ) {
    // logger.debug('writeDoc:', { ...docInfo, data: null })

    function finish() {
      const data = docInfo.data
      const deletedInt = newRevIsDeleted ? 1 : 0

      const id = data._id
      const rev = data._rev
      const json = stringifyDoc(data)
      const sql =
        'INSERT INTO ' +
        BY_SEQ_STORE +
        ' (doc_id, rev, json, deleted) VALUES (?, ?, ?, ?);'
      const sqlArgs = [id, rev, json, deletedInt]

      async function insertAttachmentMappings(seq: number) {
        const attsToAdd = Object.keys(data._attachments || {})

        if (!attsToAdd.length) {
          return
        }

        function add(att: string) {
          const sql =
            'INSERT INTO ' +
            ATTACH_AND_SEQ_STORE +
            ' (digest, seq) VALUES (?,?)'
          const sqlArgs = [data._attachments[att].digest, seq]
          return tx.executeAsync(sql, sqlArgs)
        }

        await Promise.all(attsToAdd.map((att) => add(att)))
      }

      tx.executeAsync(sql, sqlArgs).then(
        (result) => {
          const seq = result.insertId
          if (typeof seq === 'number')
            return insertAttachmentMappings(seq).then(() => {
              return dataWritten(tx, seq)
            })
          else return Promise.resolve()
        },
        () => {
          const fetchSql = select(
            'seq',
            BY_SEQ_STORE,
            null,
            'doc_id=? AND rev=?'
          )
          tx.executeAsync(fetchSql, [id, rev]).then(
            (res) => {
              const seq = res.rows?.item(0).seq
              const sql =
                'UPDATE ' +
                BY_SEQ_STORE +
                ' SET json=?, deleted=? WHERE doc_id=? AND rev=?;'
              const sqlArgs = [json, deletedInt, id, rev]
              return tx.executeAsync(sql, sqlArgs).then(() => {
                return insertAttachmentMappings(seq).then(() =>
                  dataWritten(tx, seq)
                )
              })
            },
            (err) => {
              console.error('failed!!', err)
            }
          )
          return false
        }
      )
    }

    function collectResults(attachmentErr?: any) {
      if (!err) {
        if (attachmentErr) {
          err = attachmentErr
          callback(err)
        } else if (recv === attachments.length) {
          finish()
        }
      }
    }

    let err: any = null
    let recv = 0

    docInfo.data._id = docInfo.metadata.id
    docInfo.data._rev = docInfo.metadata.rev
    const attachments = Object.keys(docInfo.data._attachments || {})

    if (newRevIsDeleted) {
      docInfo.data._deleted = true
    }

    function attachmentSaved(err: any) {
      recv++
      collectResults(err)
    }

    attachments.forEach((key) => {
      const att = docInfo.data._attachments[key]
      if (!att.stub) {
        const data = att.data
        delete att.data
        att.revpos = parseInt(winningRev, 10)
        const digest = att.digest
        saveAttachment(digest, data).then(attachmentSaved)
      } else {
        recv++
        collectResults()
      }
    })

    if (!attachments.length) {
      finish()
    }

    async function dataWritten(tx: Transaction, seq: number) {
      const id = docInfo.metadata.id

      let revsToCompact = docInfo.stemmedRevs || []
      if (isUpdate && api.auto_compaction) {
        revsToCompact = compactTree(docInfo.metadata).concat(revsToCompact)
      }
      if (revsToCompact.length) {
        await compactRevs(revsToCompact, id, tx)
      }

      docInfo.metadata.seq = seq
      const rev = docInfo.metadata.rev
      delete docInfo.metadata.rev

      const sql = isUpdate
        ? 'UPDATE ' +
          DOC_STORE +
          ' SET json=?, max_seq=?, winningseq=' +
          '(SELECT seq FROM ' +
          BY_SEQ_STORE +
          ' WHERE doc_id=' +
          DOC_STORE +
          '.id AND rev=?) WHERE id=?'
        : 'INSERT INTO ' +
          DOC_STORE +
          ' (id, winningseq, max_seq, json) VALUES (?,?,?,?);'
      const metadataStr = safeJsonStringify(docInfo.metadata)
      const params = isUpdate
        ? [metadataStr, seq, winningRev, id]
        : [id, seq, seq, metadataStr]
      return tx.executeAsync(sql, params).then(
        () => {
          results[resultsIdx] = {
            ok: true,
            id: docInfo.metadata.id,
            rev: rev,
          }
          fetchedDocs.set(id, docInfo.metadata)
          callback()
        },
        (err) => {
          console.error('Failed!!', { id, seq, isUpdate }, err)
          callback(err)
        }
      )
    }
  }

  function websqlProcessDocs(): Promise<void> {
    return new Promise((resolve, reject) => {
      let chain = Promise.resolve()
      processDocs(
        dbOpts.revs_limit,
        docInfos,
        api,
        fetchedDocs,
        tx,
        results,
        (
          docInfo: DocInfo,
          winningRev: string,
          winningRevIsDeleted: boolean,
          newRevIsDeleted: boolean,
          isUpdate: boolean,
          delta: number,
          resultsIdx: number,
          callback: (err?: any) => void
        ) => {
          chain = chain.then(() => {
            return new Promise<void>((resolve, reject) => {
              writeDoc(
                docInfo,
                winningRev,
                winningRevIsDeleted,
                newRevIsDeleted,
                isUpdate,
                delta,
                resultsIdx,
                (err?: any) => {
                  if (err) {
                    reject(err)
                  } else {
                    resolve()
                  }
                  callback(err)
                }
              )
            })
          })
        },
        opts,
        (err?: any) => {
          if (!err) resolve()
          else reject(err)
        }
      )
    })
  }

  function fetchExistingDocs(): Promise<void> {
    return new Promise((resolve) => {
      if (!docInfos.length) {
        return resolve()
      }

      let numFetched = 0

      function checkDone() {
        if (++numFetched === docInfos.length) {
          resolve()
        }
      }

      docInfos.forEach((docInfo) => {
        if (docInfo._id && isLocalId(docInfo._id)) {
          return checkDone()
        }
        const id = docInfo.metadata.id
        tx.executeAsync('SELECT json FROM ' + DOC_STORE + ' WHERE id = ?', [
          id,
        ]).then((result) => {
          if (result.rows?.length) {
            const metadata = safeJsonParse(result.rows.item(0).json)
            fetchedDocs.set(id, metadata)
          }
          checkDone()
        })
      })
    })
  }

  async function saveAttachment(digest: string, data: any) {
    logger.debug('saveAttachment:', digest)
    let sql = 'SELECT digest FROM ' + ATTACH_STORE + ' WHERE digest=?'
    const result = await tx.executeAsync(sql, [digest])
    if (result.rows?.length) return
    sql =
      'INSERT INTO ' + ATTACH_STORE + ' (digest, body, escaped) VALUES (?,?,0)'
    await tx.executeAsync(sql, [digest, data])
  }

  preprocessAttachments(docInfos, 'binary', (err: any) => {
    if (err) {
      console.error('preprocessAttachments error:', err)
      return callback(err)
    }
    transaction(async (txn: Transaction) => {
      try {
        tx = txn
        try {
          await verifyAttachments()
        } catch (err) {
          preconditionErrored = err
        }
        if (!preconditionErrored) {
          await fetchExistingDocs()
          await websqlProcessDocs()
        }

        complete()
      } catch (e: any) {
        handleSQLiteError(e, callback)
      }
    })
  })
}

export default sqliteBulkDocs

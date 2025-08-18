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

async function sqliteBulkDocs(
  dbOpts: DBOptions,
  req: Request,
  opts: Options,
  api: any,
  transaction: (fn: (tx: Transaction) => Promise<void>) => Promise<void>,
  sqliteChanges: any
): Promise<any> {
  const newEdits = opts.new_edits
  const userDocs = req.docs

  const docInfos: DocInfo[] = userDocs.map((doc) => {
    if (doc._id && isLocalId(doc._id)) {
      return doc
    }
    try {
      return parseDoc(doc, newEdits, dbOpts)
    } catch (err: any) {
      logger.error('Error parsing doc:', err)
      return {
        ...doc,
        error: err,
      }
    }
  })

  const docInfoErrors = docInfos.filter((docInfo) => docInfo.error)
  if (docInfoErrors.length > 0) {
    throw docInfoErrors[0]?.error
  }

  let tx: Transaction
  const results = new Array(docInfos.length)
  const fetchedDocs = new Map<string, any>()

  async function verifyAttachment(digest: string) {
    logger.debug('verify attachment:', digest)
    const sql =
      'SELECT count(*) as cnt FROM ' + ATTACH_STORE + ' WHERE digest=?'
    const result = await tx.execute(sql, [digest])
    if (result.rows[0]?.cnt === 0) {
      const err = createError(
        MISSING_STUB,
        'unknown stub attachment with digest ' + digest
      )
      logger.error('unknown:', err)
      throw err
    } else {
      logger.debug('ok')
      return true
    }
  }

  async function verifyAttachments(): Promise<void> {
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

    if (!digests.length) return

    for (const digest of digests) {
      await verifyAttachment(digest)
    }
  }

  async function writeDoc(
    docInfo: DocInfo,
    winningRev: string,
    _winningRevIsDeleted: boolean,
    newRevIsDeleted: boolean,
    isUpdate: boolean,
    _delta: number,
    resultsIdx: number
  ) {
    logger.debug('writeDoc:', { ...docInfo, data: null })

    async function dataWritten(tx: Transaction, seq: number) {
      const id = docInfo.metadata.id

      let revsToCompact = docInfo.stemmedRevs || []
      if (isUpdate && api.auto_compaction) {
        revsToCompact = compactTree(docInfo.metadata).concat(revsToCompact)
      }
      if (revsToCompact.length) {
        compactRevs(revsToCompact, id, tx)
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
      await tx.execute(sql, params)
      results[resultsIdx] = {
        ok: true,
        id: docInfo.metadata.id,
        rev: rev,
      }
      fetchedDocs.set(id, docInfo.metadata)
    }

    async function insertAttachmentMappings(seq: number) {
      const attsToAdd = Object.keys(data._attachments || {})

      if (!attsToAdd.length) {
        return
      }

      function add(att: string) {
        const sql =
          'INSERT INTO ' + ATTACH_AND_SEQ_STORE + ' (digest, seq) VALUES (?,?)'
        const sqlArgs = [data._attachments[att].digest, seq]
        return tx.execute(sql, sqlArgs)
      }

      await Promise.all(attsToAdd.map((att) => add(att)))
    }

    docInfo.data._id = docInfo.metadata.id
    docInfo.data._rev = docInfo.metadata.rev
    const attachments = Object.keys(docInfo.data._attachments || {})

    if (newRevIsDeleted) {
      docInfo.data._deleted = true
    }

    for (const key of attachments) {
      const att = docInfo.data._attachments[key]
      if (!att.stub) {
        const data = att.data
        delete att.data
        att.revpos = parseInt(winningRev, 10)
        const digest = att.digest
        await saveAttachment(digest, data)
      }
    }

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

    try {
      const result = await tx.execute(sql, sqlArgs)
      const seq = result.insertId
      if (typeof seq === 'number') {
        await insertAttachmentMappings(seq)
        await dataWritten(tx, seq)
      }
    } catch (e) {
      // constraint error, recover by updating instead (see #1638)
      // https://github.com/pouchdb/pouchdb/issues/1638
      const fetchSql = select('seq', BY_SEQ_STORE, null, 'doc_id=? AND rev=?')
      const res = await tx.execute(fetchSql, [id, rev])
      const seq = res.rows[0]!.seq as number
      logger.debug(
        `Got a constraint error, updating instead: seq=${seq}, id=${id}, rev=${rev}`
      )
      const sql =
        'UPDATE ' +
        BY_SEQ_STORE +
        ' SET json=?, deleted=? WHERE doc_id=? AND rev=?;'
      const sqlArgs = [json, deletedInt, id, rev]
      await tx.execute(sql, sqlArgs)
      await insertAttachmentMappings(seq)
      await dataWritten(tx, seq)
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
            return writeDoc(
              docInfo,
              winningRev,
              winningRevIsDeleted,
              newRevIsDeleted,
              isUpdate,
              delta,
              resultsIdx
            ).then(callback, callback)
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

  async function fetchExistingDocs(): Promise<void> {
    if (!docInfos.length) return

    for (const docInfo of docInfos) {
      if (docInfo._id && isLocalId(docInfo._id)) {
        continue
      }
      const id = docInfo.metadata.id
      const result = await tx.execute(
        'SELECT json FROM ' + DOC_STORE + ' WHERE id = ?',
        [id]
      )
      if (result.rows?.length) {
        const metadata = safeJsonParse(result.rows[0]!.json)
        fetchedDocs.set(id, metadata)
      }
    }
  }

  async function saveAttachment(digest: string, data: any) {
    logger.debug('saveAttachment:', digest)
    let sql = 'SELECT digest FROM ' + ATTACH_STORE + ' WHERE digest=?'
    const result = await tx.execute(sql, [digest])
    if (result.rows?.length) return
    sql =
      'INSERT INTO ' + ATTACH_STORE + ' (digest, body, escaped) VALUES (?,?,0)'
    await tx.execute(sql, [digest, data])
  }

  await new Promise<void>((resolve, reject) => {
    preprocessAttachments(docInfos, 'binary', (err: any) => {
      if (err) reject(err)
      else resolve()
    })
  })

  await transaction(async (txn: Transaction) => {
    await verifyAttachments()

    try {
      tx = txn
      await fetchExistingDocs()
      await websqlProcessDocs()
      sqliteChanges.notify(api._name)
    } catch (err: any) {
      throw handleSQLiteError(err)
    }
  })

  return results
}

export default sqliteBulkDocs

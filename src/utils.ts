import { createError, WSQ_ERROR } from 'pouchdb-errors'
import { guardedConsole } from 'pouchdb-utils'
import { Buffer } from '@craftzdog/react-native-buffer'
import { BY_SEQ_STORE, ATTACH_STORE, ATTACH_AND_SEQ_STORE } from './constants'
import type { Transaction } from '@op-engineering/op-sqlite'

function stringifyDoc(doc: Record<string, any>): string {
  // don't bother storing the id/rev. it uses lots of space,
  // in persistent map/reduce especially
  delete doc._id
  delete doc._rev
  return JSON.stringify(doc)
}

function unstringifyDoc(
  doc: string,
  id: string,
  rev: string
): Record<string, any> {
  const parsedDoc = JSON.parse(doc)
  parsedDoc._id = id
  parsedDoc._rev = rev
  return parsedDoc
}

// question mark groups IN queries, e.g. 3 -> '(?,?,?)'
function qMarks(num: number): string {
  let s = '('
  while (num--) {
    s += '?'
    if (num) {
      s += ','
    }
  }
  return s + ')'
}

function select(
  selector: string,
  table: string | string[],
  joiner?: string | null,
  where?: string | string[],
  orderBy?: string
): string {
  return (
    'SELECT ' +
    selector +
    ' FROM ' +
    (typeof table === 'string' ? table : table.join(' JOIN ')) +
    (joiner ? ' ON ' + joiner : '') +
    (where
      ? ' WHERE ' + (typeof where === 'string' ? where : where.join(' AND '))
      : '') +
    (orderBy ? ' ORDER BY ' + orderBy : '')
  )
}

async function compactRevs(
  revs: string[],
  docId: string,
  tx: Transaction
): Promise<void> {
  if (!revs.length) {
    return
  }

  let numDone = 0
  const seqs: number[] = []

  function checkDone() {
    if (++numDone === revs.length) {
      // done
      deleteOrphans()
    }
  }

  async function deleteOrphans() {
    // find orphaned attachment digests

    if (!seqs.length) {
      return
    }

    let sql =
      'SELECT DISTINCT digest AS digest FROM ' +
      ATTACH_AND_SEQ_STORE +
      ' WHERE seq IN ' +
      qMarks(seqs.length)

    let res = await tx.execute(sql, seqs)
    const digestsToCheck: string[] = []
    if (res.rows) {
      for (let i = 0; i < res.rows.length; i++) {
        digestsToCheck.push(res.rows[i]!.digest as string)
      }
    }
    if (!digestsToCheck.length) {
      return
    }

    sql =
      'DELETE FROM ' +
      ATTACH_AND_SEQ_STORE +
      ' WHERE seq IN (' +
      seqs.map(() => '?').join(',') +
      ')'
    await tx.execute(sql, seqs)
    sql =
      'SELECT digest FROM ' +
      ATTACH_AND_SEQ_STORE +
      ' WHERE digest IN (' +
      digestsToCheck.map(() => '?').join(',') +
      ')'
    res = await tx.execute(sql, digestsToCheck)
    const nonOrphanedDigests = new Set<string>()
    if (res.rows) {
      for (let i = 0; i < res.rows.length; i++) {
        nonOrphanedDigests.add(res.rows[i]!.digest as string)
      }
    }
    for (const digest of digestsToCheck) {
      if (nonOrphanedDigests.has(digest)) {
        return
      }
      await tx.execute(
        'DELETE FROM ' + ATTACH_AND_SEQ_STORE + ' WHERE digest=?',
        [digest]
      )
      await tx.execute('DELETE FROM ' + ATTACH_STORE + ' WHERE digest=?', [
        digest,
      ])
    }
  }

  // update by-seq and attach stores in parallel
  for (const rev of revs) {
    const sql = 'SELECT seq FROM ' + BY_SEQ_STORE + ' WHERE doc_id=? AND rev=?'

    const res = await tx.execute(sql, [docId, rev])
    if (!res.rows?.length) {
      // already deleted
      return checkDone()
    }
    const seq = res.rows[0]!.seq as number
    seqs.push(seq)

    await tx.execute('DELETE FROM ' + BY_SEQ_STORE + ' WHERE seq=?', [seq])
  }
}

export function handleSQLiteError(
  event: Error,
  callback?: (error: any) => void
) {
  guardedConsole('error', 'SQLite threw an error', event)
  if (event.constructor && event.constructor.name === 'PouchError') {
    if (callback) callback(event)
    return event
  }

  // event may actually be a SQLError object, so report is as such
  const errorNameMatch =
    event && event.constructor.toString().match(/function ([^(]+)/)
  const errorName = (errorNameMatch && errorNameMatch[1]) || event.name
  const errorReason = event.message
  const error = createError(WSQ_ERROR, errorReason, errorName)
  if (callback) callback(error)
  return error
}

/**
 * Converts an op-sqlite BLOB (returned as an ArrayBuffer) back into a binary
 * string. Chunked so large attachments don't overflow the call stack.
 */
function arrayBufferToBinaryString(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  const chunkSize = 8192
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return binary
}

/**
 * Converts a binary string (each char code is one byte, 0–255) into an
 * ArrayBuffer suitable for binding to an op-sqlite BLOB column.
 */
function binaryStringToArrayBuffer(bin: string): ArrayBuffer {
  const length = bin.length
  const buf = new ArrayBuffer(length)
  const arr = new Uint8Array(buf)
  for (let i = 0; i < length; i++) {
    arr[i] = bin.charCodeAt(i)
  }
  return buf
}

/**
 * Base64-encodes a binary string (each char code is one byte, 0–255), backed by
 * react-native-quick-base64 via @craftzdog/react-native-buffer.
 */
function btoa(input: string): string {
  return Buffer.from(input, 'binary').toString('base64')
}

export {
  stringifyDoc,
  unstringifyDoc,
  qMarks,
  select,
  compactRevs,
  arrayBufferToBinaryString,
  binaryStringToArrayBuffer,
  btoa,
}

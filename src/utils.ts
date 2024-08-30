import { createError, WSQ_ERROR } from 'pouchdb-errors'
import { guardedConsole } from 'pouchdb-utils'
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

    let res = await tx.executeAsync(sql, seqs)
    const digestsToCheck: string[] = []
    if (res.rows) {
      for (let i = 0; i < res.rows.length; i++) {
        digestsToCheck.push(res.rows.item(i).digest)
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
    await tx.executeAsync(sql, seqs)
    sql =
      'SELECT digest FROM ' +
      ATTACH_AND_SEQ_STORE +
      ' WHERE digest IN (' +
      digestsToCheck.map(() => '?').join(',') +
      ')'
    res = await tx.executeAsync(sql, digestsToCheck)
    const nonOrphanedDigests = new Set<string>()
    if (res.rows) {
      for (let i = 0; i < res.rows.length; i++) {
        nonOrphanedDigests.add(res.rows.item(i).digest)
      }
    }
    for (const digest of digestsToCheck) {
      if (nonOrphanedDigests.has(digest)) {
        return
      }
      await tx.executeAsync(
        'DELETE FROM ' + ATTACH_AND_SEQ_STORE + ' WHERE digest=?',
        [digest]
      )
      await tx.executeAsync('DELETE FROM ' + ATTACH_STORE + ' WHERE digest=?', [
        digest,
      ])
    }
  }

  // update by-seq and attach stores in parallel
  for (const rev of revs) {
    const sql = 'SELECT seq FROM ' + BY_SEQ_STORE + ' WHERE doc_id=? AND rev=?'

    const res = await tx.executeAsync(sql, [docId, rev])
    if (!res.rows?.length) {
      // already deleted
      return checkDone()
    }
    const seq = res.rows.item(0).seq
    seqs.push(seq)

    await tx.executeAsync('DELETE FROM ' + BY_SEQ_STORE + ' WHERE seq=?', [seq])
  }
}

export function handleSQLiteError(
  event: Error,
  callback?: (error: any) => void
) {
  guardedConsole('error', 'SQLite threw an error', event)
  // event may actually be a SQLError object, so report is as such
  const errorNameMatch =
    event && event.constructor.toString().match(/function ([^(]+)/)
  const errorName = (errorNameMatch && errorNameMatch[1]) || event.name
  const errorReason = event.message
  const error = createError(WSQ_ERROR, errorReason, errorName)
  if (callback) callback(error)
  else return error
}

export { stringifyDoc, unstringifyDoc, qMarks, select, compactRevs }

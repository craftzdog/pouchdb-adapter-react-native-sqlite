import { createError, WSQ_ERROR } from 'pouchdb-errors'
import { guardedConsole } from 'pouchdb-utils'

import { BY_SEQ_STORE, ATTACH_STORE, ATTACH_AND_SEQ_STORE } from './constants'

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

function compactRevs(revs: string[], docId: string, tx: any): void {
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

  function deleteOrphans() {
    // find orphaned attachment digests

    if (!seqs.length) {
      return
    }

    const sql =
      'SELECT DISTINCT digest AS digest FROM ' +
      ATTACH_AND_SEQ_STORE +
      ' WHERE seq IN ' +
      qMarks(seqs.length)

    tx.executeSql(sql, seqs, function (tx: any, res: any) {
      const digestsToCheck: string[] = []
      for (let i = 0; i < res.rows.length; i++) {
        digestsToCheck.push(res.rows.item(i).digest)
      }
      if (!digestsToCheck.length) {
        return
      }

      const sql =
        'DELETE FROM ' +
        ATTACH_AND_SEQ_STORE +
        ' WHERE seq IN (' +
        seqs.map(() => '?').join(',') +
        ')'
      tx.executeSql(sql, seqs, function (tx: any) {
        const sql =
          'SELECT digest FROM ' +
          ATTACH_AND_SEQ_STORE +
          ' WHERE digest IN (' +
          digestsToCheck.map(() => '?').join(',') +
          ')'
        tx.executeSql(sql, digestsToCheck, function (tx: any, res: any) {
          const nonOrphanedDigests = new Set<string>()
          for (let i = 0; i < res.rows.length; i++) {
            nonOrphanedDigests.add(res.rows.item(i).digest)
          }
          digestsToCheck.forEach(function (digest) {
            if (nonOrphanedDigests.has(digest)) {
              return
            }
            tx.executeSql(
              'DELETE FROM ' + ATTACH_AND_SEQ_STORE + ' WHERE digest=?',
              [digest]
            )
            tx.executeSql('DELETE FROM ' + ATTACH_STORE + ' WHERE digest=?', [
              digest,
            ])
          })
        })
      })
    })
  }

  // update by-seq and attach stores in parallel
  revs.forEach(function (rev) {
    const sql = 'SELECT seq FROM ' + BY_SEQ_STORE + ' WHERE doc_id=? AND rev=?'

    tx.executeSql(sql, [docId, rev], function (tx: any, res: any) {
      if (!res.rows.length) {
        // already deleted
        return checkDone()
      }
      const seq = res.rows.item(0).seq
      seqs.push(seq)

      tx.executeSql(
        'DELETE FROM ' + BY_SEQ_STORE + ' WHERE seq=?',
        [seq],
        checkDone
      )
    })
  })
}

export function handleSQLiteError(
  event: Error,
  callback: (error: any) => void
) {
  guardedConsole('error', 'SQLite threw an error', event)
  // event may actually be a SQLError object, so report is as such
  const errorNameMatch =
    event && event.constructor.toString().match(/function ([^(]+)/)
  const errorName = (errorNameMatch && errorNameMatch[1]) || event.name
  const errorReason = event.message
  callback(createError(WSQ_ERROR, errorReason, errorName))
}

export { stringifyDoc, unstringifyDoc, qMarks, select, compactRevs }

const { open } = require('@op-engineering/op-sqlite')

describe('test.doc_count.js-sqlite3', function () {
  var dbs = {}

  beforeEach(function () {
    dbs.name = testUtils.adapterUrl('sqlite3', 'testdb')
  })

  afterEach(function (done) {
    testUtils.cleanup([dbs.name], done)
  })

  // A separate op-sqlite connection to the adapter's database file
  function withRawDb(fn) {
    var raw = open({ name: dbs.name + '.sqlite' })
    try {
      return fn(raw)
    } finally {
      raw.close()
    }
  }

  function queryRow(raw, sql) {
    return raw.executeSync(sql).rows[0]
  }

  function countDocsDirectly(raw) {
    return queryRow(
      raw,
      "SELECT COUNT(*) AS num FROM 'document-store' JOIN 'by-sequence' " +
        "ON 'by-sequence'.seq = 'document-store'.winningseq " +
        "WHERE 'by-sequence'.deleted = 0"
    ).num
  }

  function readMeta(raw) {
    return queryRow(
      raw,
      "SELECT doc_count, doc_count_seq FROM 'metadata-store'"
    )
  }

  async function assertCount(db, expected) {
    var info = await db.info()
    info.doc_count.should.equal(expected, 'info.doc_count')
    var res = await db.allDocs({ limit: 0 })
    res.total_rows.should.equal(expected, 'allDocs total_rows')
    withRawDb(function (raw) {
      countDocsDirectly(raw).should.equal(expected, 'actual count')
      readMeta(raw).doc_count.should.equal(expected, 'stored count')
    })
  }

  it('stores a zero count for a new database', async function () {
    var db = new PouchDB(dbs.name)
    await assertCount(db, 0)
  })

  it('keeps the count through creates, updates and deletes', async function () {
    var db = new PouchDB(dbs.name)
    await db.bulkDocs([{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }])
    await assertCount(db, 3)

    var a = await db.get('a')
    await db.put(Object.assign(a, { updated: true }))
    await assertCount(db, 3)

    var b = await db.get('b')
    await db.remove(b)
    await assertCount(db, 2)

    await db.put({ _id: 'b' })
    await assertCount(db, 3)

    await db.put({ _id: '_local/x' })
    await assertCount(db, 3)

    await db.put({ _id: '_design/x', views: {} })
    await assertCount(db, 4)
  })

  it('does not change the count for rejected writes', async function () {
    var db = new PouchDB(dbs.name)
    await db.put({ _id: 'a' })
    var res = await db.bulkDocs([
      { _id: 'a' },
      { _id: 'b', _rev: '1-abc' },
      { _id: 'c' }
    ])
    res[0].error.should.equal(true)
    res[1].error.should.equal(true)
    await assertCount(db, 2)
  })

  it('counts duplicate ids in one request once', async function () {
    var db = new PouchDB(dbs.name)
    await db.bulkDocs(
      [
        { _id: 'a', _rev: '1-a', v: 1 },
        { _id: 'a', _rev: '1-b', v: 2 },
        {
          _id: 'a',
          _rev: '2-c',
          _deleted: true,
          _revisions: { start: 2, ids: ['c', 'b'] }
        }
      ],
      { new_edits: false }
    )
    await assertCount(db, 1)
  })

  it('handles conflicts and deleted winning revisions', async function () {
    var db = new PouchDB(dbs.name)
    await db.bulkDocs(
      [
        { _id: 'a', _rev: '1-a' },
        { _id: 'a', _rev: '1-b' }
      ],
      { new_edits: false }
    )
    await assertCount(db, 1)

    var winner = await db.get('a')
    await db.remove(winner)
    await assertCount(db, 1)

    var other = await db.get('a')
    await db.remove(other)
    await assertCount(db, 0)

    await db.bulkDocs([{ _id: 'a', _rev: '5-z' }], { new_edits: false })
    await assertCount(db, 1)

    await db.bulkDocs([{ _id: 'd', _rev: '1-d', _deleted: true }], {
      new_edits: false
    })
    await assertCount(db, 1)
  })

  it('keeps the count through compaction', async function () {
    var db = new PouchDB(dbs.name, { auto_compaction: true })
    var doc = { _id: 'a' }
    for (var i = 0; i < 5; i++) {
      var res = await db.put(doc)
      doc._rev = res.rev
    }
    await db.put({ _id: 'b' })
    await db.remove('b', (await db.get('b'))._rev)
    await db.compact()
    await assertCount(db, 1)
  })

  it('recounts on open when the stored count is stale', async function () {
    var db = new PouchDB(dbs.name)
    await db.bulkDocs([{ _id: 'a' }, { _id: 'b' }])
    await db.close()

    withRawDb(function (raw) {
      raw.executeSync("UPDATE 'metadata-store' SET doc_count = 100")
      raw.executeSync(
        "UPDATE sqlite_sequence SET seq = seq + 1 WHERE name = 'by-sequence'"
      )
    })

    db = new PouchDB(dbs.name)
    await assertCount(db, 2)
    await db.put({ _id: 'c' })
    await assertCount(db, 3)
  })

  it('does not use a stale count before a write repairs it', async function () {
    var db = new PouchDB(dbs.name)
    await db.bulkDocs([{ _id: 'a' }, { _id: 'b' }])

    withRawDb(function (raw) {
      raw.executeSync("UPDATE 'metadata-store' SET doc_count = 100")
      raw.executeSync(
        "UPDATE sqlite_sequence SET seq = seq + 1 WHERE name = 'by-sequence'"
      )
    })

    var info = await db.info()
    info.doc_count.should.equal(2)
    var res = await db.allDocs()
    res.total_rows.should.equal(2)

    await db.put({ _id: 'c' })
    await assertCount(db, 3)
  })

  it('keeps the count when replicating conflicts and deletions', async function () {
    var source = new PouchDB(dbs.name + '_source')
    try {
      var docs = []
      for (var i = 0; i < 300; i++) {
        docs.push({ _id: 'doc' + String(i).padStart(3, '0'), i: i })
      }
      await source.bulkDocs(docs)

      var conflicts = []
      for (var j = 0; j < 300; j += 3) {
        conflicts.push({
          _id: docs[j]._id,
          _rev: '1-conflict' + j,
          _deleted: j % 2 === 0
        })
      }
      await source.bulkDocs(conflicts, { new_edits: false })

      var all = await source.allDocs({ include_docs: true })
      var removals = all.rows
        .filter(function (row) {
          return row.doc.i % 5 === 0
        })
        .map(function (row) {
          return Object.assign(row.doc, { _deleted: true })
        })
      await source.bulkDocs(removals)

      var target = new PouchDB(dbs.name)
      await source.replicate.to(target)

      var sourceInfo = await source.info()
      sourceInfo.doc_count.should.equal(250)
      await assertCount(target, sourceInfo.doc_count)
    } finally {
      await source.destroy()
    }
  })

  it('migrates a database created before the stored count', async function () {
    var db = new PouchDB(dbs.name)
    await db.bulkDocs([{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }])
    await db.remove(await db.get('c'))
    await db.close()

    withRawDb(function (raw) {
      raw.executeSync("ALTER TABLE 'metadata-store' DROP COLUMN doc_count")
      raw.executeSync("ALTER TABLE 'metadata-store' DROP COLUMN doc_count_seq")
      raw.executeSync("UPDATE 'metadata-store' SET db_version = 7")
    })

    db = new PouchDB(dbs.name)
    await assertCount(db, 2)
    withRawDb(function (raw) {
      queryRow(
        raw,
        "SELECT db_version FROM 'metadata-store'"
      ).db_version.should.equal(8)
    })
  })
})

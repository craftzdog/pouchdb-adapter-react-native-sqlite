var adapters = ['sqlite3']
var autoCompactionAdapters = ['sqlite3']

adapters.forEach(function (adapter) {
  describe('suite2 test.compaction.js-' + adapter, function () {
    this.timeout(120000) // 2 mins - these tests can take a while!

    var dbs = {}

    beforeEach(function () {
      dbs.name = testUtils.adapterUrl(adapter, 'testdb')
    })

    afterEach(function (done) {
      testUtils.cleanup([dbs.name], done)
    })

    it('#3350 compact should return {ok: true}', function (done) {
      var db = new PouchDB(dbs.name)
      db.compact(function (err, result) {
        should.not.exist(err)
        result.should.eql({ ok: true })

        done()
      })
    })

    it('compact with options object', function () {
      var db = new PouchDB(dbs.name)
      return db.compact({}).then(function (result) {
        result.should.eql({ ok: true })
      })
    })

    it('#2913 massively parallel compaction', function () {
      var db = new PouchDB(dbs.name)
      var tasks = []
      for (var i = 0; i < 30; i++) {
        tasks.push(i)
      }

      return Promise.all(
        tasks.map(function (i) {
          var doc = { _id: 'doc_' + i }
          return db
            .put(doc)
            .then(function () {
              return db.compact()
            })
            .then(function () {
              return db.get('doc_' + i)
            })
            .then(function (doc) {
              return db.put(doc)
            })
            .then(function () {
              return db.compact()
            })
        })
      )
    })

    it('Compaction document with no revisions to remove', function (done) {
      var db = new PouchDB(dbs.name)
      var doc = { _id: 'foo', value: 'bar' }
      db.put(doc, function () {
        db.compact(function () {
          db.get('foo', function (err) {
            done(err)
          })
        })
      })
    })

    it('Compation on empty db', function (done) {
      var db = new PouchDB(dbs.name)
      db.compact(function () {
        done()
      })
    })

    it('Compation on empty db with interval option', function (done) {
      var db = new PouchDB(dbs.name)
      db.compact({ interval: 199 }, function () {
        done()
      })
    })

    it('Simple compation test', function (done) {
      var db = new PouchDB(dbs.name)
      var doc = {
        _id: 'foo',
        value: 'bar'
      }
      db.post(doc, function (err, res) {
        var rev1 = res.rev
        doc._rev = rev1
        doc.value = 'baz'
        db.post(doc, function (err, res) {
          var rev2 = res.rev
          db.compact(function () {
            db.get('foo', { rev: rev1 }, function (err) {
              err.status.should.equal(404)
              err.name.should.equal(
                'not_found',
                'compacted document is missing'
              )
              db.get('foo', { rev: rev2 }, function (err) {
                done(err)
              })
            })
          })
        })
      })
    })

    var checkBranch = function (db, docs, callback) {
      function check(i) {
        var doc = docs[i]
        db.get(doc._id, { rev: doc._rev }, function (err) {
          try {
            if (i < docs.length - 1) {
              should.exist(err, 'should be compacted: ' + doc._rev)
              err.status.should.equal(404, 'compacted!')
              check(i + 1)
            } else {
              should.not.exist(err, 'should not be compacted: ' + doc._rev)
              callback()
            }
          } catch (assertionError) {
            callback(assertionError)
          }
        })
      }
      check(0)
    }

    var checkTree = function (db, tree, callback) {
      function check(i) {
        checkBranch(db, tree[i], function (err) {
          if (err) {
            return callback(err)
          }
          if (i < tree.length - 1) {
            check(i + 1)
          } else {
            callback()
          }
        })
      }
      check(0)
    }

    var exampleTree = [
      [
        { _id: 'foo', _rev: '1-a', value: 'foo a' },
        { _id: 'foo', _rev: '2-b', value: 'foo b' },
        { _id: 'foo', _rev: '3-c', value: 'foo c' }
      ],
      [
        { _id: 'foo', _rev: '1-a', value: 'foo a' },
        { _id: 'foo', _rev: '2-d', value: 'foo d' },
        { _id: 'foo', _rev: '3-e', value: 'foo e' },
        { _id: 'foo', _rev: '4-f', value: 'foo f' }
      ],
      [
        { _id: 'foo', _rev: '1-a', value: 'foo a' },
        { _id: 'foo', _rev: '2-g', value: 'foo g' },
        { _id: 'foo', _rev: '3-h', value: 'foo h' },
        { _id: 'foo', _rev: '4-i', value: 'foo i' },
        { _id: 'foo', _rev: '5-j', _deleted: true, value: 'foo j' }
      ]
    ]

    var exampleTree2 = [
      [
        { _id: 'bar', _rev: '1-m', value: 'bar m' },
        { _id: 'bar', _rev: '2-n', value: 'bar n' },
        { _id: 'bar', _rev: '3-o', _deleted: true, value: 'foo o' }
      ],
      [
        { _id: 'bar', _rev: '2-n', value: 'bar n' },
        { _id: 'bar', _rev: '3-p', value: 'bar p' },
        { _id: 'bar', _rev: '4-r', value: 'bar r' },
        { _id: 'bar', _rev: '5-s', value: 'bar s' }
      ],
      [
        { _id: 'bar', _rev: '3-p', value: 'bar p' },
        { _id: 'bar', _rev: '4-t', value: 'bar t' },
        { _id: 'bar', _rev: '5-u', value: 'bar u' }
      ]
    ]

    it.skip('Compact more complicated tree', function (done) {
      var db = new PouchDB(dbs.name)
      testUtils.putTree(db, exampleTree, function () {
        db.compact(function () {
          checkTree(db, exampleTree, function (err) {
            done(err)
          })
        })
      })
    })

    it.skip('Compact two times more complicated tree', function (done) {
      var db = new PouchDB(dbs.name)
      testUtils.putTree(db, exampleTree, function () {
        db.compact(function () {
          db.compact(function () {
            checkTree(db, exampleTree, function (err) {
              done(err)
            })
          })
        })
      })
    })

    it.skip('Compact database with at least two documents', function (done) {
      var db = new PouchDB(dbs.name)
      testUtils.putTree(db, exampleTree, function () {
        testUtils.putTree(db, exampleTree2, function () {
          db.compact(function () {
            checkTree(db, exampleTree, function () {
              checkTree(db, exampleTree2, function (err) {
                done(err)
              })
            })
          })
        })
      })
    })

    it('Compact deleted document', function (done) {
      var db = new PouchDB(dbs.name)
      db.put({ _id: 'foo' }, function (err, res) {
        var firstRev = res.rev
        db.remove(
          {
            _id: 'foo',
            _rev: firstRev
          },
          function () {
            db.compact(function () {
              db.get('foo', { rev: firstRev }, function (err) {
                should.exist(err, 'got error')
                err.status.should.equal(
                  testUtils.errors.MISSING_DOC.status,
                  'correct error status returned'
                )
                err.message.should.equal(
                  testUtils.errors.MISSING_DOC.message,
                  'correct error message returned'
                )
                done()
              })
            })
          }
        )
      })
    })

    it('Compact db with sql-injecty doc id', function (done) {
      var db = new PouchDB(dbs.name)
      var id = "'sql_injection_here"
      db.put({ _id: id }, function (err, res) {
        var firstRev = res.rev
        db.remove(
          {
            _id: id,
            _rev: firstRev
          },
          function () {
            db.compact(function () {
              db.get(id, { rev: firstRev }, function (err) {
                should.exist(err, 'got error')
                err.status.should.equal(
                  testUtils.errors.MISSING_DOC.status,
                  'correct error status returned'
                )
                err.message.should.equal(
                  testUtils.errors.MISSING_DOC.message,
                  'correct error message returned'
                )
                done()
              })
            })
          }
        )
      })
    })

    function getRevisions(db, docId) {
      return db
        .get(docId, {
          revs: true,
          open_revs: 'all'
        })
        .then(function (docs) {
          var combinedResult = []
          return Promise.all(
            docs.map(function (doc) {
              doc = doc.ok
              // convert revision IDs into full _rev hashes
              var start = doc._revisions.start
              return Promise.all(
                doc._revisions.ids.map(function (id, i) {
                  var rev = start - i + '-' + id
                  return db
                    .get(docId, { rev })
                    .then(function (doc) {
                      return { rev, doc }
                    })
                    .catch(function (err) {
                      if (err.status !== 404) {
                        throw err
                      }
                      return { rev }
                    })
                })
              ).then(function (docsAndRevs) {
                combinedResult = combinedResult.concat(docsAndRevs)
              })
            })
          ).then(function () {
            return combinedResult
          })
        })
    }

    it('Compaction removes non-leaf revs (#2807)', function () {
      var db = new PouchDB(dbs.name, { auto_compaction: false })
      var doc = { _id: 'foo' }
      return db
        .put(doc)
        .then(function (res) {
          doc._rev = res.rev
          return getRevisions(db, 'foo')
        })
        .then(function (docsAndRevs) {
          docsAndRevs.should.have.length(1)
          return db.put(doc)
        })
        .then(function (res) {
          doc._rev = res.rev
          return getRevisions(db, 'foo')
        })
        .then(function (docsAndRevs) {
          docsAndRevs.should.have.length(2)
          should.exist(docsAndRevs[0].doc)
          should.exist(docsAndRevs[1].doc)
          return db.compact()
        })
        .then(function () {
          return getRevisions(db, 'foo')
        })
        .then(function (docsAndRevs) {
          docsAndRevs.should.have.length(2)
          should.exist(docsAndRevs[0].doc)
          should.not.exist(docsAndRevs[1].doc)
        })
    })

    it.skip('Compaction removes non-leaf revs pt 2 (#2807)', function () {
      var db = new PouchDB(dbs.name, { auto_compaction: false })
      var doc = { _id: 'foo' }
      return db
        .put(doc)
        .then(function (res) {
          doc._rev = res.rev
          return db.put(doc)
        })
        .then(function (res) {
          doc._rev = res.rev
          return db.put(doc)
        })
        .then(function () {
          return db.compact()
        })
        .then(function () {
          return getRevisions(db, 'foo')
        })
        .then(function (docsAndRevs) {
          docsAndRevs.should.have.length(3)
          should.exist(docsAndRevs[0].doc)
          should.not.exist(docsAndRevs[1].doc)
          should.not.exist(docsAndRevs[2].doc)
        })
    })

    it.skip('Compaction removes non-leaf revs pt 3 (#2807)', function () {
      var db = new PouchDB(dbs.name, { auto_compaction: false })

      var docs = [
        {
          _id: 'foo',
          _rev: '1-a1',
          _revisions: { start: 1, ids: ['a1'] }
        },
        {
          _id: 'foo',
          _rev: '2-a2',
          _revisions: { start: 2, ids: ['a2', 'a1'] }
        },
        {
          _id: 'foo',
          _deleted: true,
          _rev: '3-a3',
          _revisions: { start: 3, ids: ['a3', 'a2', 'a1'] }
        },
        {
          _id: 'foo',
          _rev: '1-b1',
          _revisions: { start: 1, ids: ['b1'] }
        }
      ]

      return db
        .bulkDocs(docs, { new_edits: false })
        .then(function () {
          return getRevisions(db, 'foo')
        })
        .then(function (docsAndRevs) {
          docsAndRevs.should.have.length(4)
          should.exist(docsAndRevs[0].doc)
          should.exist(docsAndRevs[1].doc)
          should.exist(docsAndRevs[2].doc)
          should.exist(docsAndRevs[3].doc)
          return db.compact()
        })
        .then(function () {
          return getRevisions(db, 'foo')
        })
        .then(function (docsAndRevs) {
          docsAndRevs.should.have.length(4)
          var asMap = {}
          docsAndRevs.forEach(function (docAndRev) {
            asMap[docAndRev.rev] = docAndRev.doc
          })
          // only leafs remain
          should.not.exist(asMap['1-a1'])
          should.not.exist(asMap['2-a2'])
          should.exist(asMap['3-a3'])
          should.exist(asMap['1-b1'])
        })
    })

    it.skip('Compaction removes non-leaf revs pt 4 (#2807)', function () {
      var db = new PouchDB(dbs.name, { auto_compaction: false })
      var doc = { _id: 'foo' }
      return db
        .put(doc)
        .then(function (res) {
          doc._rev = res.rev
          doc._deleted = true
          return db.put(doc)
        })
        .then(function (res) {
          doc._rev = res.rev
          delete doc._deleted
          return db.put(doc)
        })
        .then(function () {
          return db.compact()
        })
        .then(function () {
          return getRevisions(db, 'foo')
        })
        .then(function (docsAndRevs) {
          docsAndRevs.should.have.length(3)
          should.exist(docsAndRevs[0].doc)
          should.not.exist(docsAndRevs[1].doc)
          should.not.exist(docsAndRevs[2].doc)
        })
    })

    it.skip('Compaction removes non-leaf revs pt 5 (#2807)', function () {
      var db = new PouchDB(dbs.name, { auto_compaction: false })
      var doc = { _id: 'foo' }
      return db
        .put(doc)
        .then(function (res) {
          doc._rev = res.rev
          return db.put(doc)
        })
        .then(function (res) {
          doc._rev = res.rev
          doc._deleted = true
          return db.put(doc)
        })
        .then(function () {
          return db.compact()
        })
        .then(function () {
          return getRevisions(db, 'foo')
        })
        .then(function (docsAndRevs) {
          docsAndRevs.should.have.length(3)
          should.exist(docsAndRevs[0].doc)
          should.not.exist(docsAndRevs[1].doc)
          should.not.exist(docsAndRevs[2].doc)
        })
    })

    it('#2931 - synchronous putAttachment + compact', function () {
      var db = new PouchDB(dbs.name)
      var queue = db.put({ _id: 'doc' })

      var otherPromises = []

      for (var i = 0; i < 50; i++) {
        queue = queue.then(function () {
          return db.get('doc').then(function (doc) {
            doc._attachments = doc._attachments || {}
            var blob = testUtils.makeBlob(
              testUtils.btoa(Math.random().toString()),
              'text/plain'
            )
            return db.putAttachment(
              doc._id,
              'att.txt',
              doc._rev,
              blob,
              'text/plain'
            )
          })
        })
        queue.then(function () {
          var promise = Promise.all([
            db.compact(),
            db.compact(),
            db.compact(),
            db.compact(),
            db.compact()
          ])
          otherPromises.push(promise)
          return promise
        })
      }
      return queue.then(function () {
        return Promise.all(otherPromises)
      })
    })

    it('#2931 - synchronous putAttachment + compact 2', function () {
      var db = new PouchDB(dbs.name)
      var queue = db.put({ _id: 'doc' })

      var compactQueue = Promise.resolve()

      for (var i = 0; i < 50; i++) {
        queue = queue.then(function () {
          return db.get('doc').then(function (doc) {
            doc._attachments = doc._attachments || {}
            var blob = testUtils.makeBlob(
              testUtils.btoa(Math.random().toString()),
              'text/plain'
            )
            return db.putAttachment(
              doc._id,
              'att.txt',
              doc._rev,
              blob,
              'text/plain'
            )
          })
        })
        queue.then(function () {
          compactQueue = compactQueue.then(function () {
            return Promise.all([
              db.compact(),
              db.compact(),
              db.compact(),
              db.compact(),
              db.compact()
            ])
          })
        })
      }
      return queue.then(function () {
        return compactQueue
      })
    })

    it('#8525 - Only compact document with seq > last_seq', async function () {
      if (dbs.name.slice(0, 4) === 'http') {
        // Check for remote target
        // Remote compaction cannot be avoided, skip the test:
        return this.skip()
      }

      const db = new PouchDB(dbs.name, { auto_compaction: false })
      const rev = (await db.put({ _id: 'foo' })).rev
      await db.put({ _id: 'foo', _rev: rev })
      // Hack compaction last_seq to make like a previous compaction already
      // happened.
      await db.put({ _id: '_local/compaction', last_seq: 2 })
      await db.compact()
      // If the document is compacted the following crashes:
      await db.get('foo', { rev })
    })
  })
})

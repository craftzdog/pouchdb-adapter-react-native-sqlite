// Order matters: install the mocha BDD globals and the PouchDB/chai globals
// BEFORE requiring any test file — each test file calls describe() at
// module-evaluation time, so describe/it/PouchDB/should must already be global.
import '../MochaSetup'
import './setup'

// Core suites (Phase 1 scope). Attachments, replication, and the remote parts of
// changes come in later phases (they need Buffer-heavy paths / a live CouchDB).
require('./basics.test')
require('./all_docs.test')
require('./bulk_docs.test')
require('./bulk_get.test')
require('./get.test')
require('./conflicts.test')
require('./local_docs.test')
require('./design_docs.test')
require('./revs_diff.test')
require('./deterministicrevs.test')
require('./events.test')
require('./close.test')
require('./compaction.test')

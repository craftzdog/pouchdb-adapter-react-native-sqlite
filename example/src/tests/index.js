// Order matters: install the mocha BDD globals and the PouchDB/chai globals
// BEFORE requiring any test file — each test file calls describe() at
// module-evaluation time, so describe/it/PouchDB/should must already be global.
import '../MochaSetup'
import './setup'

// Core suites + attachments.
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
require('./attachments.test')

// Replication. Start the local server first: `yarn --cwd example run-pouchdb-server`.
// Adapter pairs (remote vs local) are set at the top of replication.test.js.
require('./replication.test')

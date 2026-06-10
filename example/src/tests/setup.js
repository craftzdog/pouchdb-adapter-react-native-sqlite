// React Native analog of the source suite's `node.setup.js`: installs the chai
// globals and a PouchDB bound to the op-sqlite `react-native-sqlite` adapter, so
// the conformance test files find `PouchDB`, `should`, `assert` and `testUtils`
// on the global scope exactly as they expect.
const { Buffer } = require('buffer') // aliased to @craftzdog/react-native-buffer

// pouchdb-binary-utils / attachment helpers reference global.Buffer.
global.Buffer = global.Buffer || Buffer

const chai = (global.chai = require('chai'))
const chaiAsPromised = require('chai-as-promised')
global.should = chai.should()
global.assert = chai.assert
chai.use(chaiAsPromised.default)

// Reuse the example's already-configured PouchDB (pouchdb-core + http +
// replication + mapreduce + react-native-sqlite). pouchdb-core is a module
// singleton shared with src/pouchdb.ts, so re-pluginning the same plugins here
// would redefine non-configurable properties (e.g. replication's
// `replicate`/`sync`) and throw "property is not configurable".
const PouchDB = require('../pouchdb').default

// The source `node.setup.js` uses `prefix: 'tmp/'`; op-sqlite manages files in
// the app sandbox, so we drop the prefix. The literal `'sqlite3'` adapter
// strings in the test files only feed `testUtils.adapterUrl` (local-vs-http
// selection), so they stay harmless and the test files need no edits.
global.PouchDB = PouchDB.defaults({ adapter: 'react-native-sqlite' })

global.testUtils = require('./utils')

// React Native analog of the source suite's `node.setup.js`: installs the chai
// globals and a PouchDB bound to the op-sqlite `react-native-sqlite` adapter, so
// the conformance test files find `PouchDB`, `should`, `assert` and `testUtils`
// on the global scope exactly as they expect.
const { Buffer } = require('buffer') // aliased to @craftzdog/react-native-buffer
const { Platform } = require('react-native')

// pouchdb-binary-utils / attachment helpers reference global.Buffer.
global.Buffer = global.Buffer || Buffer

// Point the suite's remote (testUtils.couchHost) at the local
// pouchdb-server. The iOS simulator reaches the host as `localhost`; the Android
// emulator reaches it as `10.0.2.2`. Set it on process.env (what couchHost reads)
// rather than via react-native-dotenv, which only rewrites build-time `@env`
// imports, not runtime `process.env`.
// Use 127.0.0.1 (not `localhost`) on iOS: pouchdb-server binds IPv4-only, but the
// simulator resolves `localhost` to IPv6 (::1) first → connection refused. Android
// emulator reaches the host loopback as 10.0.2.2.
global.process.env.COUCH_HOST =
  global.process.env.COUCH_HOST ||
  `http://${Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1'}:5984`

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
// Don't force `adapter` here: react-native-sqlite is registered as the *preferred*
// adapter (3rd arg `true` in PouchDB.adapter(...)), so local dbs select it by
// default — while forcing it would also pin it on `http://` URL names, routing the
// remote-replication tests' remote db to the local SQLite adapter instead of the
// http adapter (→ no server traffic).
global.PouchDB = PouchDB.defaults({})

global.testUtils = require('./utils')

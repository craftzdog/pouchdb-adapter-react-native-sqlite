const path = require('path')
const { getDefaultConfig } = require('@react-native/metro-config')
const { withMetroConfig } = require('react-native-monorepo-config')

const root = path.resolve(__dirname, '..')
const appEntryPath = path.join(__dirname, 'index.js')
const { dependencies, devDependencies } = require('./package.json')
const appDependencies = new Set([...Object.keys(dependencies), ...Object.keys(devDependencies)])

/**
 * Returns the package a module specifier belongs to, e.g. `react-native/Libraries/x` -> `react-native`.
 *
 * @param {string} moduleName - A module specifier as written in an import
 * @returns {string} The package name
 */
const getPackageName = moduleName =>
  moduleName
    .split('/')
    .slice(0, moduleName.startsWith('@') ? 2 : 1)
    .join('/')

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = withMetroConfig(getDefaultConfig(__dirname), {
  root,
  dirname: __dirname,
  workspaces: ['example'],
  conditions: ['pouchdb-adapter-react-native-sqlite-source']
})

config.resolver.unstable_enablePackageExports = true

// These pouchdb packages ship a `browser` build that Metro picks by default, but
// in React Native `isNode()` is true so the whole stack expects the Node
// (Buffer/crypto) paths. Their browser builds break under RN:
//   - pouchdb-binary-utils: `binaryStringToBlobOrBuffer` builds `new Blob([ArrayBuffer])`
//     (RN's Blob can't wrap an ArrayBuffer); `blobOrBufferToBinaryString` reads via
//     FileReader (can't read a Buffer).
//   - pouchdb-md5: `binaryMd5` on non-string input reads via FileReader and uses
//     `data.size` (undefined for a Buffer → NaN chunking) → the callback never fires,
//     hanging every `putAttachment` of a Buffer blob.
// The adapter no longer imports either directly, but pouchdb-adapter-utils (attachment
// pre/post-processing in bulkDocs) and the conformance test helpers do. Force Node builds.
const FORCE_NODE_BUILD = {
  'pouchdb-binary-utils': 'pouchdb-binary-utils/lib/index.js',
  'pouchdb-md5': 'pouchdb-md5/lib/index.js'
}
const defaultResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const nodeEntry = FORCE_NODE_BUILD[moduleName]
  if (nodeEntry) {
    return {
      type: 'sourceFile',
      filePath: require.resolve(nodeEntry)
    }
  }
  const resolutionContext = appDependencies.has(getPackageName(moduleName))
    ? { ...context, originModulePath: appEntryPath }
    : context
  const resolve = defaultResolveRequest || context.resolveRequest
  return resolve(resolutionContext, moduleName, platform)
}

module.exports = config

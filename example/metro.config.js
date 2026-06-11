const path = require('path')
const { getDefaultConfig } = require('@react-native/metro-config')
const { withMetroConfig } = require('react-native-monorepo-config')

const root = path.resolve(__dirname, '..')

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = withMetroConfig(getDefaultConfig(__dirname), {
  root,
  dirname: __dirname,
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
  'pouchdb-md5': 'pouchdb-md5/lib/index.js',
}
const defaultResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const nodeEntry = FORCE_NODE_BUILD[moduleName]
  if (nodeEntry) {
    return {
      type: 'sourceFile',
      filePath: require.resolve(nodeEntry),
    }
  }
  const resolve = defaultResolveRequest || context.resolveRequest
  return resolve(context, moduleName, platform)
}

module.exports = config

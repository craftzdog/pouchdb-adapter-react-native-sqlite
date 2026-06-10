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

// pouchdb-binary-utils (v9 has no `exports` field) resolves to its `browser`
// build by default, which is broken under React Native: `binaryStringToBlobOrBuffer`
// builds `new Blob([ArrayBuffer])` (RN's Blob can't be built from an ArrayBuffer)
// and `blobOrBufferToBinaryString` reads via FileReader (can't read a Buffer). The
// adapter no longer imports it directly, but two transitive consumers still need
// its Node (Buffer) build: pouchdb-adapter-utils (attachment pre/post-processing in
// bulkDocs) and the conformance test helpers (tests/utils.js `binaryStringToBlob`).
const defaultResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'pouchdb-binary-utils') {
    return {
      type: 'sourceFile',
      filePath: require.resolve('pouchdb-binary-utils/lib/index.js'),
    }
  }
  const resolve = defaultResolveRequest || context.resolveRequest
  return resolve(context, moduleName, platform)
}

module.exports = config

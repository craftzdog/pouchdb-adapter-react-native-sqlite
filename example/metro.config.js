const path = require('node:path')
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

/**
 * pouchdb packages whose `browser` build Metro would pick, mapped to their Node build.
 *
 * pouchdb takes its Node code paths under React Native, which pass Buffers, and these browser
 * builds cannot handle a Buffer there.
 */
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

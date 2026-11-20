const path = require('node:path')
const { getConfig } = require('react-native-builder-bob/babel-config')
const pkg = require('../package.json')

const root = path.resolve(__dirname, '..')

module.exports = getConfig(
  {
    presets: ['module:@react-native/babel-preset'],
    plugins: [
      path.resolve(__dirname, 'babel-plugin-preserve-fn-source.js'),
      [
        'module-resolver',
        {
          extensions: ['.tsx', '.ts', '.js', '.json'],
          alias: {
            '@': './src',
            crypto: 'react-native-quick-crypto',
            stream: 'readable-stream',
            buffer: '@craftzdog/react-native-buffer',
            'pouchdb-errors': '@craftzdog/pouchdb-errors'
          }
        }
      ],
      ['module:react-native-dotenv']
    ]
  },
  { root, pkg }
)

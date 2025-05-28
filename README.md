# pouchdb-adapter-react-native-sqlite

PouchDB adapter using [op-sqlite](https://github.com/OP-Engineering/op-sqlite) as its backing store on React Native.
It's much faster than AsyncStorage.

As of v4.0.0, it no longer requires `@craftzdog/pouchdb-adapter-websql-core`.
It now directly uses op-sqlite, so it's more efficient.

## How to use

### Installation

```sh
yarn add @op-engineering/op-sqlite react-native-quick-crypto @craftzdog/react-native-buffer @craftzdog/pouchdb-errors
```

### Polyfill NodeJS APIs

Create a `shim.ts` file like so:

```ts
import { install } from 'react-native-quick-crypto'

install()
```

Configure babel to use the shim modules. First, you need to install `babel-plugin-module-resolver`.

```sh
yarn add --dev babel-plugin-module-resolver
```

Then, in your `babel.config.js`, add the plugin to swap the `crypto`, `stream` and `buffer` dependencies:

```js
    plugins: [
      [
        'module-resolver',
        {
          extensions: ['.tsx', '.ts', '.js', '.json'],
          alias: {
            crypto: 'react-native-quick-crypto',
            stream: 'readable-stream',
            buffer: '@craftzdog/react-native-buffer',
            'pouchdb-errors': '@craftzdog/pouchdb-errors'
          },
        },
      ],
    ],
```

Then restart your bundler using `yarn start --reset-cache`.

### Install PouchDB and adapter

Now it's ready to use PouchDB!

```sh
yarn add pouchdb-core pouchdb-mapreduce pouchdb-replication pouchdb-adapter-http pouchdb-adapter-react-native-sqlite
```

Create `pouchdb.ts`:

```ts
import PouchDB from 'pouchdb-core'
import HttpPouch from 'pouchdb-adapter-http'
import replication from 'pouchdb-replication'
import mapreduce from 'pouchdb-mapreduce'
import sqliteAdapter from 'pouchdb-adapter-react-native-sqlite'

export default PouchDB.plugin(HttpPouch)
  .plugin(replication)
  .plugin(mapreduce)
  .plugin(sqliteAdapter)
```

### How to use PouchDB

```ts
import PouchDB from './pouchdb'

const pouch = new PouchDB('mydb', {
  adapter: 'react-native-sqlite',
  // Other options
})
```

### Options

You can specify the following options in the PouchDB options:

- `location`: The location of the SQLite database file. See [op-sqlite's docs](https://op-engineering.github.io/op-sqlite/docs/configuration) for more details.
- `encryptionKey`: The encryption key for SQLCipher. See [op-sqlite's docs](https://op-engineering.github.io/op-sqlite/docs/api#sqlcipher-open) for more details.

## Troubleshootings

### Fails to install crypto shim with `install()` on launch

You amy get the following error when new arch is enabled:

```
 (NOBRIDGE) ERROR  Error: Failed to install react-native-quick-crypto: React Native is not running on-device. QuickCrypto can only be used when synchronous method invocations (JSI) are possible. If you are using a remote debugger (e.g. Chrome), switch to an on-device debugger (e.g. Flipper) instead.
 (NOBRIDGE) ERROR  TypeError: Cannot read property 'install' of undefined
```

- This is a know issue: [Error: Failed to install react-native-quick-crypto: React Native is not running on-device. · Issue #333 · margelo/react-native-quick-crypto · GitHub](https://github.com/margelo/react-native-quick-crypto/issues/333)

For now, you have to edit:

- `lib/module/NativeQuickCrypto/NativeQuickCrypto.js`

And comment them out:

```
  // Check if we are running on-device (JSI)
  // if (global.nativeCallSyncHook == null || QuickCryptoModule.install == null) {
  //   throw new Error('Failed to install react-native-quick-crypto: React Native is not running on-device. QuickCrypto can only be used when synchronous method invocations (JSI) are possible. If you are using a remote debugger (e.g. Chrome), switch to an on-device debugger (e.g. Flipper) instead.');
  // }
```

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT © Takuya Matsuyama

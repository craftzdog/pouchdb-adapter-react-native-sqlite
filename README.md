# pouchdb-adapter-react-native-sqlite

PouchDB adapter using [op-sqlite](https://github.com/OP-Engineering/op-sqlite) as its backing store on React Native.
It's much faster than AsyncStorage.

As of v4.0.0, it no longer requires `@craftzdog/pouchdb-adapter-websql-core`.
It now directly uses op-sqlite, so it's more efficient.

## Installation

```sh
npm install pouchdb-adapter-react-native-sqlite
```

## Usage

```js
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

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT © Takuya Matsuyama

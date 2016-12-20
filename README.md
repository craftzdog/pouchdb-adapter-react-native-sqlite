pouchdb-adapter-react-native-sqlite
======

PouchDB adapter using ReactNative SQLite as its backing store.

### Prerequisites

- [pouchdb-react-native](https://github.com/stockulus/pouchdb-react-native)
- [react-native-sqlite-storage](https://github.com/andpor/react-native-sqlite-storage)

### Usage

Install from npm:

```bash
npm install pouchdb-react-native pouchdb-adapter-react-native-sqlite --save
react-native install react-native-sqlite-storage
```

Then `import` it, notify PouchDB of the plugin, and initialize a database using the `react-native-sqlite` adapter name:

```js
import PouchDB from 'pouchdb-react-native'
import SQLite from 'react-native-sqlite-storage'
import SQLiteAdapterFactory from 'pouchdb-adapter-react-native-sqlite'

const SQLiteAdapter = SQLiteAdapterFactory(SQLite)
PouchDB.plugin(SQLiteAdapter)
const db = new PouchDB('mydb.db', {adapter: 'react-native-sqlite'});
```

## Changelog

- 1.0.0
  - Initial release

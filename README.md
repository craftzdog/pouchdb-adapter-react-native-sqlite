pouchdb-adapter-react-native-sqlite
======

PouchDB adapter using ReactNative SQLite as its backing store.

### Why?

SQLite storage performs much faster than AsyncStorage, especially with secondary index.
Here is benchmark results:

| 1) `allDocs` speed | min  | max  | mean |
|---------------|------|------|------|
| AsyncStorage  | 72ms | 94ms | 77ms |
| SQLite        | 27ms | 39ms | 28ms |

| 2) `query` speed   | min    | max    | mean   |
|---------------|--------|--------|--------|
| AsyncStorage  | 1075ms | 1117ms | 1092ms |
| SQLite        | 33ms   | 39ms   | 35ms   |

 * Device: iPhone 6s
 * Documents: 434
 * Update seq: 453
 * Iterations: 100
 * Used options: `{ include_docs: true }`

### Prerequisites

- [pouchdb-react-native](https://github.com/stockulus/pouchdb-react-native)
- A SQLite module
  - [react-native-sqlite-2 (recommended)](https://github.com/noradaiko/react-native-sqlite-2)
  - [react-native-sqlite-storage](https://github.com/andpor/react-native-sqlite-storage)

### Usage

Install from npm:

```bash
npm install pouchdb-react-native pouchdb-adapter-react-native-sqlite --save
react-native install react-native-sqlite-2
```

Then `import` it, notify PouchDB of the plugin, and initialize a database using the `react-native-sqlite` adapter name:

```js
import PouchDB from 'pouchdb-react-native'
import SQLite from 'react-native-sqlite-2'
import SQLiteAdapterFactory from 'pouchdb-adapter-react-native-sqlite'

const SQLiteAdapter = SQLiteAdapterFactory(SQLite)
PouchDB.plugin(SQLiteAdapter)
const db = new PouchDB('mydb.db', {adapter: 'react-native-sqlite'});
```

## Changelog

- 1.0.1
  - Remove unnecessary console output
- 1.0.0
  - Initial release

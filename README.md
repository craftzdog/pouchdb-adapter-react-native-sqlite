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
|---------------|---------|---------|---------|
| AsyncStorage  | 1,075ms | 1,117ms | 1,092ms |
| SQLite        | 33ms    | 39ms    | 35ms    |

 * Device: iPhone 6s
 * Documents: 434
 * Update seq: 453
 * Iterations: 100
 * Used options: `{ include_docs: true }`

#### On Simulator

 * Device: iPad Pro 9.7" (Simulator) - iOS 10.3.2
 * Documents: 5000

| 3) `bulkDocs` speed   | total    | mean   |
|---------------|----------|--------|
| AsyncStorage  | 25.821ms | 5.16ms |
| SQLite        | 22.213ms | 4.44ms |

| 4) `allDocs` speed   | total    | mean   |
|---------------|-----------|---------|
| AsyncStorage  | 189,379ms | 37.87ms |
| SQLite        | 30,527ms  | 6.10ms  |

 * `allDocs` options: `{ include_docs: true, attachments: true }`
 * Using this test [script](https://gist.github.com/hnq90/972f6597a0927f45d9075b8627892783)

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

- 1.0.2
  + Upgrade pouchdb-util & pouchdb-adapter-websql-core to 6.2.0
  + Update benchmark result
- 1.0.1
  + Remove unnecessary console output
- 1.0.0
  + Initial release

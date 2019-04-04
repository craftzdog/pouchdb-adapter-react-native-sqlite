pouchdb-adapter-react-native-sqlite
======

PouchDB adapter using ReactNative SQLite as its backing store.

## Why?

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

### On Simulator

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

## How to use it

Read [this blogpost](https://dev.to/craftzdog/hacking-pouchdb-to-use-on-react-native-1gjh) for the complete description.
Here is [a working demo app](https://github.com/craftzdog/pouchdb-react-native-demo).

### Install deps

Install PouchDB core packages:

```bash
npm i pouchdb-adapter-http pouchdb-mapreduce
```

And install hacked packages for React Native:

```bash
npm i @craftzdog/pouchdb-core-react-native @craftzdog/pouchdb-replication-react-native 
```

Next, install SQLite3 engine modules:

```bash
npm i pouchdb-adapter-react-native-sqlite react-native-sqlite-2
react-native link react-native-sqlite-2
```

Then, install some packages to polyfill functions that PouchDB needs:

```bash
npm i base-64 events
```

### Create polyfills

Make a js file to polyfill some functions that PouchDB needs:

```js
import {decode, encode} from 'base-64'

if (!global.btoa) {
    global.btoa = encode;
}

if (!global.atob) {
    global.atob = decode;
}

// Avoid using node dependent modules
process.browser = true
```

Import it at the first line of your `index.js`.

### Load PouchDB

Make `pouchdb.js` like so:

```js
import PouchDB from '@craftzdog/pouchdb-core-react-native'
import HttpPouch from 'pouchdb-adapter-http'
import replication from '@craftzdog/pouchdb-replication-react-native'
import mapreduce from 'pouchdb-mapreduce'

import SQLite from 'react-native-sqlite-2'
import SQLiteAdapterFactory from 'pouchdb-adapter-react-native-sqlite'

const SQLiteAdapter = SQLiteAdapterFactory(SQLite)

export default PouchDB
  .plugin(HttpPouch)
  .plugin(replication)
  .plugin(mapreduce)
  .plugin(SQLiteAdapter)
```

If you need other plugins like `pouchdb-find`, just add them to it.

### Use PouchDB

Then, use it as usual:

```js
import PouchDB from './pouchdb'

function loadDB () {
  return new PouchDB('mydb.db', { adapter: 'react-native-sqlite' })
}
```

## Changelog

- 2.0.0
  + Upgrade pouchdb-adapter-websql-core to 7.0.0
- 1.0.3
  + Remove `pouchdb-utils` dependency
- 1.0.2
  + Upgrade pouchdb-util & pouchdb-adapter-websql-core to 6.2.0
  + Update benchmark result
- 1.0.1
  + Remove unnecessary console output
- 1.0.0
  + Initial release

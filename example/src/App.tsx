import './shim'
import React from 'react'

import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
} from 'react-native'
import PouchDB from './pouchdb'
// import { open } from '@op-engineering/op-sqlite'

// @ts-ignore eslint-ignore-next-line
const uiManager = global?.nativeFabricUIManager ? 'Fabric' : 'Paper'

console.log(`Using ${uiManager}`)

const pouch = new PouchDB('mydb', {
  adapter: 'react-native-sqlite',
})

// async function run() {
//   const db = open({ name: 'test' })
//   db.execute(
//     'CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, name TEXT)'
//   )
//
//   await db.transaction(async (tx) => {
//     await Promise.all(
//       Array.from({ length: 100 }, (_, i) =>
//         tx
//           .executeAsync('INSERT INTO test (name) VALUES (?)', ['foo'])
//           .then((result) => console.log('insertId:', result.insertId))
//       )
//     )
//   })
//
//   db.execute('DROP TABLE IF EXISTS test')
// }
//
// run()

export default function App() {
  const [result, setResult] = React.useState<string>('')
  const [imageData, setImageData] = React.useState<string | null>(null)
  const docId = 'mydoc\u0000hoge'

  const handleAllDocs = async () => {
    setResult('')
    const docs = await pouch.allDocs()
    setResult(JSON.stringify(docs, null, 2))
  }
  const handleGetDoc = async () => {
    setResult('')
    try {
      const mydoc = await pouch.get(docId)
      setResult(JSON.stringify(mydoc, null, 2))
    } catch (e: any) {
      setResult(e.name + ': ' + e.message)
    }
  }
  const handlePutDoc = async () => {
    setResult('')
    let rev
    let count = 0
    try {
      const mydoc = await pouch.get(docId)
      console.log('mydoc:', mydoc)
      rev = mydoc._rev
      count = mydoc.count || 0
    } catch (e) {}

    const r = await pouch.put({
      _rev: rev,
      _id: docId,
      title: 'Heroes',
      count: count + 1,
    })
    console.log('put:', r)
    setResult(JSON.stringify(r, null, 2))
  }
  const handlePutMultiDocs = async () => {
    setResult('')
    let count = 0

    try {
      const res = await pouch.bulkDocs(
        Array.from({ length: 10 }, (_, i) => ({
          _id: `test:${i}`,
          title: 'Heroes',
          count: count + 1,
        }))
      )
      setResult(JSON.stringify(res, null, 2))
    } catch (e: any) {
      setResult(e.name + ': ' + e.message + '\n' + e.stack)
      console.error(e)
    }
  }
  // const handlePutMultiDocs = async () => {
  //   setResult('')
  //   let count = 0
  //
  //   const res = await Promise.all(
  //     Array.from({ length: 100 }, (_, i) =>
  //       pouch.put({
  //         _id: `test:${i}`,
  //         title: 'Heroes',
  //         count: count + 1,
  //       })
  //     )
  //   )
  //   setResult(JSON.stringify(res, null, 2))
  // }
  const handleRemoveDoc = async () => {
    setResult('')
    try {
      const mydoc = await pouch.get(docId)
      const result = await pouch.remove(mydoc)
      console.log('ret:', result)
      setResult(JSON.stringify(result, null, 2))
    } catch (e: any) {
      setResult(e.name + ': ' + e.message)
    }
  }
  const handleReplicate = async () => {
    setResult('Replicating from remote...')
    try {
      const result = await pouch.replicate
        .from(process.env.EXPO_PUBLIC_COUCHDB_URL, { live: false })
        .on('error', (err: any) => console.log('error:', err))
      console.log('ret:', result)
      setResult(JSON.stringify(result, null, 2))
    } catch (e: any) {
      setResult(e.name + ': ' + e.message)
    }
  }
  const handleDestroyDB = async () => {
    setResult('')
    try {
      const result = await pouch.destroy()
      console.log('ret:', result)
      setResult(JSON.stringify(result, null, 2))
    } catch (e: any) {
      setResult(e.name + ': ' + e.message)
    }
  }
  const handleQuery = async () => {
    setResult('')
    try {
      const result = await pouch.query('index_notes', {
        startkey: ['b', 'u', 'book:tjnPbJakw', 2, {}, {}],
        endkey: ['b', 'u', 'book:tjnPbJakw', 1, 0, 0],
        include_docs: true,
        descending: true,
        limit: 50,
        skip: 0,
        conflicts: true,
      })
      console.log('ret:', result)
      setResult(JSON.stringify(result, null, 2))
    } catch (e: any) {
      setResult(e.name + ': ' + e.message)
    }
  }
  const handleGetAttachment = async () => {
    setResult('')
    setImageData(null)
    try {
      const result = await pouch.get('file:9yqbnLGSq', {
        attachments: true,
      })
      setResult(JSON.stringify(result, null, 2))
      setImageData('data:image/png;base64,' + result._attachments.index.data)
      console.log('ret:', result)
    } catch (e: any) {
      setResult(e.name + ': ' + e.message)
    }
  }

  const handleWriteLocalDoc = async () => {
    setResult('')
    try {
      const result = await pouch.put({
        _id: '_local/mydoc',
        title: 'Heroes',
      })
      console.log('ret:', result)
      setResult(JSON.stringify(result, null, 2))
    } catch (e: any) {
      setResult(e.name + ': ' + e.message)
    }
  }

  const handleRemoveLocalDoc = async () => {
    setResult('')
    try {
      const mydoc = await pouch.get('_local/mydoc')
      const result = await pouch.remove(mydoc)
      console.log('ret:', result)
      setResult(JSON.stringify(result, null, 2))
    } catch (e: any) {
      setResult(e.name + ': ' + e.message)
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainerStyle}
    >
      <TouchableOpacity onPress={handleAllDocs} style={styles.button}>
        <Text style={styles.buttonText}>Fetch all docs</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleGetDoc} style={styles.button}>
        <Text style={styles.buttonText}>Get a doc</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handlePutDoc} style={styles.button}>
        <Text style={styles.buttonText}>Put a doc</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handlePutMultiDocs} style={styles.button}>
        <Text style={styles.buttonText}>Put docs</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleRemoveDoc} style={styles.button}>
        <Text style={styles.buttonText}>Delete a doc</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleReplicate} style={styles.button}>
        <Text style={styles.buttonText}>Replicate from a server</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleDestroyDB} style={styles.button}>
        <Text style={styles.buttonText}>Destroy db</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleQuery} style={styles.button}>
        <Text style={styles.buttonText}>Run a query</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleGetAttachment} style={styles.button}>
        <Text style={styles.buttonText}>Get an attachment</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleWriteLocalDoc} style={styles.button}>
        <Text style={styles.buttonText}>Write a local doc</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleRemoveLocalDoc} style={styles.button}>
        <Text style={styles.buttonText}>Remove a local doc</Text>
      </TouchableOpacity>
      {imageData && (
        <Image
          source={{ uri: imageData }}
          style={{ width: 100, height: 50, resizeMode: 'contain' }}
        />
      )}
      <View style={{ marginVertical: 20 }}>
        <Text>{result}</Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
    padding: 12,
    paddingTop: 80,
    backgroundColor: 'white',
  },
  contentContainerStyle: {
    gap: 12,
  },
  box: {
    width: 60,
    height: 60,
    marginVertical: 20,
  },
  button: {
    padding: 8,
    paddingHorizontal: 16,
    backgroundColor: 'navy',
    borderRadius: 4,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
  },
})

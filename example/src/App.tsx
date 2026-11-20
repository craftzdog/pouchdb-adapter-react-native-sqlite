import './shim'
import React from 'react'
import { StyleSheet, View, Text, TouchableOpacity, Image, ScrollView } from 'react-native'

import PouchDB from './pouchdb'
import { TestList } from './TestList'

const appGlobal = globalThis as typeof globalThis & {
  nativeFabricUIManager?: unknown
  pouch?: unknown
}

const uiManager = appGlobal.nativeFabricUIManager ? 'Fabric' : 'Paper'

console.log(`Using ${uiManager}`)

const pouch = new PouchDB('mydb', {
  adapter: 'react-native-sqlite',
  revs_limit: 100
})
appGlobal.pouch = pouch

export default function App() {
  const [result, setResult] = React.useState<string>('')
  const [imageData, setImageData] = React.useState<string | null>(null)
  const [showDemo, setShowDemo] = React.useState<boolean>(false)
  const docId = 'mydoc\u0000hoge'

  const handleAllDocs = async () => {
    setResult('')
    const docs = await pouch.allDocs()
    console.log('all docs:', docs)
    setResult(JSON.stringify(docs, null, 2))
  }
  const handleGetDoc = async () => {
    setResult('')
    try {
      const mydoc = await pouch.get(docId)
      setResult(JSON.stringify(mydoc, null, 2))
    } catch (error: any) {
      setResult(error.name + ': ' + error.message)
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
    } catch {}

    const r = await pouch.put({
      _rev: rev,
      _id: docId,
      title: 'Heroes',
      count: count + 1
    })
    console.log('put:', r)
    setResult(JSON.stringify(r, null, 2))
  }
  const handlePutMultiDocs = async () => {
    setResult('')
    const count = 0

    try {
      const res = await pouch.bulkDocs(
        Array.from({ length: 10 }, (_, i) => ({
          _id: `test:${i}`,
          title: 'Heroes',
          count: count + 1
        }))
      )
      setResult(JSON.stringify(res, null, 2))
    } catch (error: any) {
      setResult(error.name + ': ' + error.message + '\n' + error.stack)
      console.error(error)
    }
  }
  const handleRemoveDoc = async () => {
    setResult('')
    try {
      const mydoc = await pouch.get(docId)
      const result = await pouch.remove(mydoc)
      console.log('ret:', result)
      setResult(JSON.stringify(result, null, 2))
    } catch (error: any) {
      setResult(error.name + ': ' + error.message)
    }
  }
  const handleReplicate = async () => {
    const remoteUrl = process.env.COUCHDB_URL
    setResult(`Replicating from remote...${remoteUrl}`)
    if (!remoteUrl) {
      setResult(
        'CouchDB URL is not set. Please set COUCHDB_URL environment variable in `.env.local`.'
      )
      return
    }
    try {
      const result = await pouch.replicate
        .from(remoteUrl, { live: false })
        .on('error', (err: any) => console.log('error:', err))
      console.log('ret:', result)
      setResult('Finished replicating from remote!')
      setResult(JSON.stringify(result, null, 2))
    } catch (error: any) {
      console.error(error)
      setResult(error.name + ': ' + error.message)
    }
  }
  const handleDestroyDB = async () => {
    setResult('')
    try {
      const result = await pouch.destroy()
      console.log('ret:', result)
      setResult(JSON.stringify(result, null, 2))
    } catch (error: any) {
      setResult(error.name + ': ' + error.message)
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
        conflicts: true
      })
      console.log('ret:', result)
      setResult(JSON.stringify(result, null, 2))
    } catch (error: any) {
      setResult(error.name + ': ' + error.message)
    }
  }
  const handleGetAttachment = async () => {
    setResult('')
    setImageData(null)
    try {
      const result = await pouch.get('file:9yqbnLGSq', {
        attachments: true
      })
      setResult(JSON.stringify(result, null, 2))
      setImageData('data:image/png;base64,' + result._attachments.index.data)
      console.log('ret:', result)
    } catch (error: any) {
      setResult(error.name + ': ' + error.message)
    }
  }

  const handleWriteLocalDoc = async () => {
    setResult('')
    try {
      const result = await pouch.put({
        _id: '_local/mydoc',
        title: 'Heroes'
      })
      console.log('ret:', result)
      setResult(JSON.stringify(result, null, 2))
    } catch (error: any) {
      setResult(error.name + ': ' + error.message)
    }
  }

  const handleRemoveLocalDoc = async () => {
    setResult('')
    try {
      const mydoc = await pouch.get('_local/mydoc')
      const result = await pouch.remove(mydoc)
      console.log('ret:', result)
      setResult(JSON.stringify(result, null, 2))
    } catch (error: any) {
      setResult(error.name + ': ' + error.message)
    }
  }

  if (!showDemo) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainerStyle}>
        <TestList />
        <TouchableOpacity
          onPress={() => setShowDemo(true)}
          style={[styles.button, styles.demoButton]}
        >
          <Text style={styles.buttonText}>Open demo screen →</Text>
        </TouchableOpacity>
      </ScrollView>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainerStyle}>
      <TouchableOpacity onPress={() => setShowDemo(false)} style={styles.button}>
        <Text style={styles.buttonText}>← Back to tests</Text>
      </TouchableOpacity>
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
    backgroundColor: 'white'
  },
  contentContainerStyle: {
    gap: 12
  },
  button: {
    padding: 8,
    paddingHorizontal: 16,
    backgroundColor: 'navy',
    borderRadius: 4
  },
  demoButton: {
    backgroundColor: '#555',
    marginTop: 8
  },
  buttonText: {
    color: 'white',
    fontSize: 16
  }
})

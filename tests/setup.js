'use strict'

require('react-native-mock/mock')

const fs = require('fs')
const Module = require('module')

const _require = Module.prototype.require

const reqPouch = () => _require(require.resolve('./pouchdb-for-coverage'))
const reqPouchModule = name => _require(require.resolve(`../pouchdb/packages/node_modules/${name}`))

const map = fs
  .readdirSync(`${__dirname}/../pouchdb/packages/node_modules`)
  .reduce((total, name) => {
    total[name] = reqPouchModule.bind(null, name)
    return total
  }, {
    '../../packages/node_modules/pouchdb-for-coverage': reqPouch,
    '../../packages/node_modules/pouchdb': reqPouch
  })

Module.prototype.require = function patchedRequire (name) {
  const callback = map[name]

  if (callback) {
    return callback()
  }

  return _require.call(this, name)
}

require('../pouchdb/tests/integration/node.setup.js')

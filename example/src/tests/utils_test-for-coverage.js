const crypto = require('crypto')

function binaryMd5(data, callback) {
  var base64 = crypto.createHash('md5').update(data, 'binary').digest('base64')
  callback(base64)
}

// Generate a unique id particular to this replication.
// Not guaranteed to align perfectly with CouchDB's rep ids.
function generateReplicationId(src, target, opts) {
  var docIds = opts.doc_ids ? opts.doc_ids.sort(collate) : ''
  var filterFun = opts.filter ? opts.filter.toString() : ''
  var queryParams = ''
  var filterViewName = ''
  var selector = ''

  // possibility for checkpoints to be lost here as behaviour of
  // JSON.stringify is not stable (see #6226)
  /* istanbul ignore if */
  if (opts.selector) {
    selector = JSON.stringify(opts.selector)
  }

  if (opts.filter && opts.query_params) {
    queryParams = JSON.stringify(sortObjectPropertiesByKey(opts.query_params))
  }

  if (opts.filter && opts.filter === '_view') {
    filterViewName = opts.view.toString()
  }

  return Promise.all([src.id(), target.id()])
    .then(function (res) {
      var queryData =
        res[0] +
        res[1] +
        filterFun +
        filterViewName +
        queryParams +
        docIds +
        selector
      return new Promise(function (resolve) {
        binaryMd5(queryData, resolve)
      })
    })
    .then(function (md5sum) {
      // can't use straight-up md5 alphabet, because
      // the char '/' is interpreted as being for attachments,
      // and + is also not url-safe
      md5sum = md5sum.replace(/\//g, '.').replace(/\+/g, '_')
      return '_local/' + md5sum
    })
}

module.exports = {
  generateReplicationId
}

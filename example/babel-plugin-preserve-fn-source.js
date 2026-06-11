// Preserve Function source for the PouchDB conformance tests under Hermes.
//
// Hermes strips function source, so `fn.toString()` returns
// "function (a0) { [bytecode] }" instead of the real body. pouchdb-mapreduce and
// filtered replication compile design-doc views/filters by eval-ing
// `fn.toString()`; without real source that eval throws "bytecode is not
// defined" (and, once such a poisoned ddoc is pushed, crashes the Node
// pouchdb-server the same way). Hermes itself *can* eval (`new Function` runs) —
// only the source text is missing.
//
// This plugin wraps every FunctionExpression in the test files as
// `__preserveFnSource(fn, "<original source>")`, which installs an own
// `toString` returning the real source. So pouchdb's `mapFun.toString()` yields
// runnable source again and the view/filter tests pass under Hermes. Scoped to
// `src/tests/` by filename so it never touches app or adapter code, and marks
// rewritten nodes to avoid reprocessing.
module.exports = function ({ types: t }) {
  const MARK = '_fnSourcePreserved'
  return {
    name: 'preserve-fn-source',
    visitor: {
      FunctionExpression(path, state) {
        const filename = state.file.opts.filename || ''
        if (filename.indexOf('/src/tests/') === -1) {
          return
        }
        const node = path.node
        if (node[MARK] || node.start == null || node.end == null) {
          return
        }
        const src = state.file.code.slice(node.start, node.end)
        node[MARK] = true
        path.replaceWith(
          t.callExpression(t.identifier('__preserveFnSource'), [
            node,
            t.stringLiteral(src),
          ])
        )
      },
    },
  }
}

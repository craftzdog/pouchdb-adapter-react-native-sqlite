/**
 * Wraps every function expression in `src/tests/` as `__preserveFnSource(fn, "<source>")`.
 *
 * Hermes strips function source, so `fn.toString()` returns `[bytecode]`, but pouchdb compiles
 * design-doc views and filters from it. `__preserveFnSource` (in `src/globals.js`) gives the
 * function a `toString` that returns the real source. Other files are left alone.
 */
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
          t.callExpression(t.identifier('__preserveFnSource'), [node, t.stringLiteral(src)])
        )
      }
    }
  }
}

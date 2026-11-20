const DOCUMENTABLE_NODE_TYPES = new Set([
  'ClassDeclaration',
  'ExportDefaultDeclaration',
  'ExportNamedDeclaration',
  'FunctionDeclaration',
  'MethodDefinition',
  'Property',
  'PropertyDefinition',
  'TSEnumDeclaration',
  'TSEnumMember',
  'TSInterfaceDeclaration',
  'TSMethodSignature',
  'TSModuleDeclaration',
  'TSPropertySignature',
  'TSTypeAliasDeclaration'
])

const isModuleExportsAssignment = node =>
  node.type === 'ExpressionStatement' &&
  node.expression.type === 'AssignmentExpression' &&
  node.expression.left.type === 'MemberExpression' &&
  node.expression.left.object.name === 'module' &&
  node.expression.left.property.name === 'exports'

const isModuleLevelVariable = node =>
  node.type === 'VariableDeclaration' &&
  (node.parent.type === 'Program' || node.parent.type === 'ExportNamedDeclaration')

const isDocumentable = node =>
  DOCUMENTABLE_NODE_TYPES.has(node.type) ||
  isModuleLevelVariable(node) ||
  isModuleExportsAssignment(node)

const isJSDocBlock = comment => comment.type === 'Block' && comment.value.startsWith('*')

const nodesStartingAt = (sourceCode, start) => {
  const nodes = []
  let node = sourceCode.getNodeByRangeIndex(start)
  while (node && node.range[0] === start) {
    nodes.push(node)
    node = node.parent
  }
  return nodes
}

const documentsDeclaration = (sourceCode, comment) => {
  const nextToken = sourceCode.getTokenAfter(comment, { includeComments: false })
  return Boolean(nextToken) && nodesStartingAt(sourceCode, nextToken.range[0]).some(isDocumentable)
}

/**
 * Reports every comment except a JSDoc block placed directly before a declaration.
 *
 * What the code does belongs in names, types and tests; why it changed, or why a
 * workaround is needed, belongs in the commit message.
 */
const noComments = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow comments other than JSDoc on declarations' },
    messages: {
      noComments: [
        'Comments are not allowed; only JSDoc directly before a declaration is.',
        'Fix the root cause instead of explaining around it:',
        'say what the code does through names, types and tests;',
        'put why a change was made, or why a workaround is needed, in the commit message;',
        'delete commented-out code, since git history keeps it;',
        'fix type errors instead of suppressing them with @ts-ignore or @ts-expect-error.'
      ].join(' ')
    },
    schema: []
  },
  create(context) {
    const { sourceCode } = context
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (comment.type === 'Shebang') {
            continue
          }
          if (isJSDocBlock(comment) && documentsDeclaration(sourceCode, comment)) {
            continue
          }
          context.report({ loc: comment.loc, messageId: 'noComments' })
        }
      }
    }
  }
}

/** Lint rules of this repository that the built-in rules cannot express. */
export default {
  meta: { name: 'local' },
  rules: { 'no-comments': noComments }
}

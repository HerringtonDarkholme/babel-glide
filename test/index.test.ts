import { parse } from '@babel/parser'
import type { Node } from '@babel/types'
import { expect, test } from 'vitest'
import { traverse, type Context } from '../src/index'


test('traverse', async () => {
  const ast = parse("const a = 1", {
    sourceType: 'module',
    plugins: [ 'typescript', 'jsx' ],
  })
  const result = traverse(ast.program, function*(node, result) {
    result.push(node.type)
    return result
  }, [] as string[])
  expect(result).toEqual([
    'Program',
    'VariableDeclaration',
    'VariableDeclarator',
    'Identifier',
    'NumericLiteral',
  ])
})

test('traverse with exit', async () => {
  const ast = parse("add(1 + 2 + 3, 4 + 5)", {
    sourceType: 'module',
    plugins: [ 'typescript', 'jsx' ],
  })
  let vals: number[] = []
  traverse(ast.program, function* (node) {
    if (node.type === 'NumericLiteral') {
      return node.value
    } else if (node.type !== 'BinaryExpression') {
      return
    }
    const { left, right } = yield
    if (node.operator === '+') {
      vals.push(left + right)
    }
    return left + right
  }, undefined)
  expect(vals).toEqual([3, 6, 9 ])
})

/**
 * Represents a scope.
 */
class Scope {
  constructor(public parent?: Scope) {
    parent?.children.push(this)
  }
  decl: Node[] = []
  children: Scope[] = []
  addDeclaration(node: Node) {
    this.decl.push(node)
  }
}

function *collectScope(node: Node, scope: Scope, { parent }: Context) {
  // function foo () {...}, class Foo {...}
  if (/(?:Function|Class)Declaration/.test(node.type)) { scope.addDeclaration(node) }
  if (node.type === 'VariableDeclaration') { // var foo = 1
    node.declarations.forEach((declaration) => { scope.addDeclaration(declaration) })
  }
  let newScope = scope // create new function scope
  if (/Function/.test(node.type)) {
    newScope = new Scope(scope) // add named function expressions
    if (node.type === 'FunctionExpression' && node.id) { newScope.addDeclaration(node) }
  }
  if (/For(?:In|Of)?Statement/.test(node.type)) { newScope = new Scope(scope) }
  if (node.type === 'BlockStatement' && parent?.type !== 'FunctionDeclaration') { newScope = new Scope(scope) }
  if (node.type === 'CatchClause') { newScope = new Scope(scope) }
  yield newScope
  return scope
}

test('traverse with scope', async () => {
  const ast = parse("function foo() { var a = 1; function bar() { var b = 2; } }", {
    sourceType: 'module',
    plugins: [ 'typescript', 'jsx' ],
  })
  const scope = traverse(ast.program, collectScope, new Scope())
  expect(scope.decl.map((node) => node.type)).toEqual([
    'FunctionDeclaration',
  ])
  expect(scope.children[0].decl.map((node) => node.type)).toEqual([
    'VariableDeclarator',
    'FunctionDeclaration',
  ])
})

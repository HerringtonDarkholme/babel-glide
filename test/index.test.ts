import { parse } from '@babel/parser'
import type { Node } from '@babel/types'
import { expect, test } from 'vitest'
import { traverse, type Context } from '../src/index'

// Assuming visitor signature is (node, acc, context)

test('traverse', async () => {
  const ast = parse("const a = 1", {
    sourceType: 'module',
    plugins: [ 'typescript', 'jsx' ],
  })
  // Visitor: (node, acc, context)
  const result = traverse(ast.program, function*(node, acc, context) {
    acc.push(node.type)
    return acc
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
  // Visitor: (node, acc, context)
  traverse(ast.program, function* (node, acc, context) { // acc is undefined here
    if (node.type === 'NumericLiteral') {
      return node.value
    } else if (node.type !== 'BinaryExpression') {
      return acc
    }
    const { left, right } = yield
    if (node.operator === '+') {
      vals.push(left + right)
    }
    return left + right
  }, undefined)
  expect(vals).toEqual([3, 6, 9 ])
})

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

function *collectScope(node: Node, scope: Scope, context: Context) {
  if (/(?:Function|Class)Declaration/.test(node.type)) { scope.addDeclaration(node) }
  if (node.type === 'VariableDeclaration') {
    node.declarations.forEach((declaration) => { scope.addDeclaration(declaration) })
  }
  let newScope = scope
  if (/Function/.test(node.type)) {
    newScope = new Scope(scope)
    if (node.type === 'FunctionExpression' && node.id) { newScope.addDeclaration(node) }
  }
  if (/For(?:In|Of)?Statement/.test(node.type)) { newScope = new Scope(scope) }
  if (node.type === 'BlockStatement' && context.parent?.type !== 'FunctionDeclaration') { newScope = new Scope(scope) }
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

test('traverse ArrayExpression and ObjectExpression', async () => {
  const code = `
    const arr = [1, "a", true];
    const obj = { x: 10, y: "b" };
  `;
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });

  function* process(node: Node, acc: string[], context: Context) {
    acc.push(node.type);
    yield acc; // Children will use the same accumulator
    return acc; // Return the accumulated array
  }

  const visitedNodeTypes = traverse(ast.program, process, []);

  expect(visitedNodeTypes).toEqual([
    'Program',
    'VariableDeclaration', // const arr = ...
    'VariableDeclarator',  // arr = [...]
    'Identifier',          // arr
    'ArrayExpression',     // [...]
    'NumericLiteral',      // 1
    'StringLiteral',       // "a"
    'BooleanLiteral',      // true
    'VariableDeclaration', // const obj = ...
    'VariableDeclarator',  // obj = {...}
    'Identifier',          // obj
    'ObjectExpression',    // {...}
    'ObjectProperty',      // x: 10
    'Identifier',          // x (key)
    'NumericLiteral',      // 10 (value)
    'ObjectProperty',      // y: "b"
    'Identifier',          // y (key)
    'StringLiteral',       // "b" (value)
  ]);
});

test('traverse UnaryExpression and CallExpression', async () => {
  const code = `
    !false;
    +1;
    -value;
    typeof foo;
    func();
    obj.method(arg1, "literal");
  `;
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });

  function* process(node: Node, acc: string[], context: Context) {
    acc.push(node.type);
    yield acc; 
    return acc; 
  }

  const visitedNodeTypes = traverse(ast.program, process, []);

  expect(visitedNodeTypes).toEqual([
    'Program',
    'ExpressionStatement', // !false;
    'UnaryExpression',     // !false
    'BooleanLiteral',      // false
    'ExpressionStatement', // +1;
    'UnaryExpression',     // +1
    'NumericLiteral',      // 1
    'ExpressionStatement', // -value;
    'UnaryExpression',     // -value
    'Identifier',          // value
    'ExpressionStatement', // typeof foo;
    'UnaryExpression',     // typeof foo
    'Identifier',          // foo
    'ExpressionStatement', // func();
    'CallExpression',      // func()
    'Identifier',          // func
    'ExpressionStatement', // obj.method(arg1, "literal");
    'CallExpression',      // obj.method(arg1, "literal")
    'MemberExpression',    // obj.method
    'Identifier',          // obj
    'Identifier',          // method
    'Identifier',          // arg1
    'StringLiteral',       // "literal"
  ]);
});

test('traverse with process function not returning after yield', async () => {
  const code = `'test';`; // Parses to Program > Directive > DirectiveLiteral
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });

  const collectedTypes: string[] = []; // Accumulator for node types

  function* process(node: Node, acc: string[], context: Context) {
    acc.push(node.type); // Perform an action
    if (node.type === 'DirectiveLiteral') { // Target the leaf node
      yield acc;
      // Implicitly returns undefined for DirectiveLiteral node after yield
    } else {
      yield acc;
      return acc; // Explicitly return accumulator for other nodes (Program, Directive)
    }
  }

  try {
    traverse(ast.program, process, collectedTypes);
    // If traverse completes without error, the test should fail
    // because we expect an error to be thrown for the DirectiveLiteral case.
    expect(true).toBe(false); 
  } catch (e: any) {
    expect(e.message).toBe('Generator function must return a value');
  }
});

test('traverse empty program', async () => {
  const ast = parse("", { sourceType: 'module' });

  function* process(node: Node, acc: string[], context: Context) {
    acc.push(node.type);
    yield acc;
    return acc;
  }

  const visitedNodeTypes = traverse(ast.program, process, []);
  expect(visitedNodeTypes).toEqual(['Program']);
});

test('traverse single literal program', async () => {
  const ast = parse("42;", { sourceType: 'module' });

  function* process(node: Node, acc: string[], context: Context) {
    acc.push(node.type);
    yield acc;
    return acc;
  }

  const visitedNodeTypes = traverse(ast.program, process, []);
  expect(visitedNodeTypes).toEqual(['Program', 'ExpressionStatement', 'NumericLiteral']);
});

// THIS TEST IS EXPECTED TO FAIL. It demonstrates a bug in traverseImpl
// where a "Generator function must return a value" error occurs with IfStatement
// when using an external collector and yielding the passed accumulator.
test('minimal IfStatement bug demonstration - EXPECTED TO FAIL (v2)', async () => {
  const code = `if (true) { 1; }`;
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });

  const collectedTypesFromMinimalTest: string[] = [];

  function* process(node: Node, acc: any, context: Context) {
    collectedTypesFromMinimalTest.push(node.type); // Push to external array
    yield acc; // Yield the accumulator passed by traverseImpl
    return null; // Return null, similar to other failing tests
  }

  try {
    traverse(ast.program, process, undefined); 
  } catch (e: any) {
    expect(e.message).toBe('Generator function must return a value');
    return; 
  }
  expect(true).toBe(false); 
});


test('traverse IfStatement and SwitchStatement', async () => {
  const code = `
    if (a > 10) {
      x = 1;
    } else {
      x = 2;
    }
    switch (y) {
      case 1:
        z = 3;
        break;
      default:
        z = 4;
    }
  `
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  })

  const visitedNodeTypes: string[] = [] 

  function* process(node: Node, acc: any, context: Context) {
    visitedNodeTypes.push(node.type);
    yield acc;
    return null; 
  }

  traverse(ast.program, process, undefined)

  expect(visitedNodeTypes).toEqual([
    'Program',
    'IfStatement',
    'BinaryExpression',
    'Identifier',
    'NumericLiteral',
    'BlockStatement',
    'ExpressionStatement',
    'AssignmentExpression',
    'Identifier',
    'NumericLiteral',
    'BlockStatement',
    'ExpressionStatement',
    'AssignmentExpression',
    'Identifier',
    'NumericLiteral',
    'SwitchStatement',
    'Identifier',
    'SwitchCase',
    'NumericLiteral',
    'ExpressionStatement',
    'AssignmentExpression',
    'Identifier',
    'NumericLiteral',
    'BreakStatement',
    'SwitchCase',
    'ExpressionStatement',
    'AssignmentExpression',
    'Identifier',
    'NumericLiteral',
  ])
})

test('traverse TryStatement and ClassDeclaration', async () => {
  const code = `
    try {
      doSomething();
    } catch (e) {
      handleError(e);
    } finally {
      cleanup();
    }

    class MyClass {
      constructor(name) {
        this.name = name;
      }

      greet() {
        return "Hello, " + this.name;
      }
    }
  `
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'], 
  })

  const visitedNodeTypes: string[] = []

  function* process(node: Node, acc: any, context: Context) {
    visitedNodeTypes.push(node.type);
    yield acc;
    return null; 
  }

  traverse(ast.program, process, undefined)

  expect(visitedNodeTypes).toEqual([
    'Program',
    'TryStatement',
    'BlockStatement', 
    'ExpressionStatement',
    'CallExpression',
    'Identifier', 
    'CatchClause',
    'Identifier', 
    'BlockStatement', 
    'ExpressionStatement',
    'CallExpression',
    'Identifier', 
    'Identifier', 
    'BlockStatement', 
    'ExpressionStatement',
    'CallExpression',
    'Identifier', 
    'ClassDeclaration',
    'Identifier', 
    'ClassBody',
    'MethodDefinition', 
    'Identifier', 
    'FunctionExpression', 
    'Identifier', 
    'BlockStatement', 
    'ExpressionStatement',
    'AssignmentExpression',
    'MemberExpression',
    'ThisExpression',
    'Identifier', 
    'Identifier', 
    'MethodDefinition', 
    'Identifier', 
    'FunctionExpression', 
    'BlockStatement', 
    'ReturnStatement',
    'BinaryExpression',
    'StringLiteral', 
    'MemberExpression',
    'ThisExpression',
    'Identifier', 
  ])
})

import type { Node } from '@babel/types'

interface NodePath {
  node: Node
  prop: string
  index?: number
}

export interface Context {
  path: NodePath[]
}
// Process one node during traversal
type Process<T> = (node: Node, item: any, context: Context) => Generator<any, T, any>

export function traverse<T>(node: Node, process: Process<T>, init: any, context?: Context): T {
  context = context || { path: [] }
  const gen = process(node, init, context)
  let next = gen.next()?.value || init
  const ret = {} as Record<keyof Node, any>
  for (const _key in node) {
    const key = _key as keyof Node
    const value = node[key]
    if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i]
          if (isNode(item)) {
            context.path.push({ node, prop: key, index: i })
            ret[key] ??= []
            ret[key][i] = traverse(item, process, next, context)
            context.path.pop()
          }
        }
      } else if (isNode(value)) {
        context.path.push({ node, prop: key })
        ret[key] = traverse(value, process, next, context)
        context.path.pop()
      }
    }
  }
  return gen.next(ret)?.value || next
}

function isNode(value: unknown): value is Node {
	return (
		value !== null && typeof value === 'object' && 'type' in value && typeof value.type === 'string'
	)
}

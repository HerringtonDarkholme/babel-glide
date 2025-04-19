import type { Node } from '@babel/types'

interface NodePath {
  node: Node
  prop: string
  index?: number
}

export interface Context {
  parent: Node | null
  path: NodePath[]
}
// Process one node during traversal
type Process<Ret, Acc=Ret> = (node: Node, acc: Acc, context: Context) => Generator<Acc, Ret, any>

export function traverse<Ret, Acc>(node: Node, process: Process<Ret, Acc>, init: Acc): Ret {
  return traverseImpl(node, process, init, {
    path: [],
    get parent() {
      return this.path.at(-1)?.node ?? null
    }
  })
}

function traverseImpl<Ret, Acc>(node: Node, process: Process<Ret, Acc>, init: Acc, context: Context): Ret {
  const gen = process(node, init, context)
  const iter1 = gen.next()
  const next = !iter1.done && iter1.value || init
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
            ret[key][i] = traverseImpl(item, process, next, context)
            context.path.pop()
          }
        }
      } else if (isNode(value)) {
        context.path.push({ node, prop: key })
        ret[key] = traverseImpl(value, process, next, context)
        context.path.pop()
      }
    }
  }
  const iter2 = gen.next(ret)
  if (!iter2.done) throw new Error('Generator function must return a value')
  if (iter2.value)  return iter2.value
  if (iter1.done) return iter1.value
  throw new Error('Generator function must return a value')
}

function isNode(value: unknown): value is Node {
	return (
		value !== null && typeof value === 'object' && 'type' in value && typeof value.type === 'string'
	)
}

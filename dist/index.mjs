
//#region src/index.ts
function traverse(node, process, init, context) {
	context = context || { path: [] };
	const gen = process(node, init, context);
	let next = gen.next()?.value || init;
	const ret = {};
	for (const _key in node) {
		const key = _key;
		const value = node[key];
		if (value && typeof value === "object") {
			if (Array.isArray(value)) for (let i = 0; i < value.length; i++) {
				const item = value[i];
				if (isNode(item)) {
					context.path.push({
						node,
						prop: key,
						index: i
					});
					ret[key] ??= [];
					ret[key][i] = traverse(item, process, next, context);
					context.path.pop();
				}
			}
			else if (isNode(value)) {
				context.path.push({
					node,
					prop: key
				});
				ret[key] = traverse(value, process, next, context);
				context.path.pop();
			}
		}
	}
	return gen.next(ret)?.value || next;
}
function isNode(value) {
	return value !== null && typeof value === "object" && "type" in value && typeof value.type === "string";
}

//#endregion
export { traverse };
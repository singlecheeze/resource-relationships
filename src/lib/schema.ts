import { parseDocument, stringify } from 'yaml';
export type Schema = { [key: string]: any };
export type SchemaBundle = { root: Schema; document: Schema; source: string };
const atPath = (value: any, path: (string | number)[]) => path.reduce((v, p) => v?.[p], value);
export function resolveSchema(schema: Schema | undefined, document: Schema, visited = new Set<string>()): Schema {
  if (!schema) return {};
  if (schema.$ref?.startsWith('#/') && !visited.has(schema.$ref)) {
    const next = new Set(visited); next.add(schema.$ref);
    return resolveSchema(atPath(document, schema.$ref.slice(2).split('/').map((s: string) => s.replace(/~1/g, '/').replace(/~0/g, '~'))), document, next);
  }
  if (schema.allOf) return schema.allOf.reduce((out: Schema, item: Schema) => {
    const resolved = resolveSchema(item, document, visited);
    return { ...out, ...resolved, properties: { ...out.properties, ...resolved.properties }, required: [...(out.required || []), ...(resolved.required || [])] };
  }, { ...schema, allOf: undefined });
  return schema;
}
export function schemaAt(bundle: SchemaBundle, path: (string | number)[]): Schema {
  let schema = resolveSchema(bundle.root, bundle.document);
  for (const key of path) schema = resolveSchema(typeof key === 'number' ? schema.items : schema.properties?.[key] || (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : undefined), bundle.document);
  return schema;
}
/** Parse a temporary prefix to obtain YAML context. Never alter the editor's model. */
export function completionContext(text: string, lineNumber: number, column: number): { path: (string | number)[]; value: boolean; startColumn: number } | undefined {
  const lines = text.split('\n'), line = lines[lineNumber - 1] || '', prefix = line.slice(0, column - 1);
  if (/\t/.test(prefix) || /[#{}[\]|>]/.test(prefix)) return;
  const valueMatch = prefix.match(/^(\s*(?:-\s+)?)[A-Za-z_][\w./-]*:\s*/);
  const keyMatch = prefix.match(/^(\s*(?:-\s+)?)[\w./-]*$/);
  if (!valueMatch && !keyMatch) return;
  const marker = '__resource_relationships_cursor_47__';
  const value = Boolean(valueMatch);
  const replacement = value ? `${valueMatch![0]}${marker}` : `${keyMatch![1]}${marker}: null`;
  const parsed = parseDocument([...lines.slice(0, lineNumber - 1), replacement].join('\n'));
  if (parsed.errors.length) return;
  let result: (string | number)[] | undefined;
  const visit = (node: any, path: (string | number)[]) => {
    if (node === marker) result = path;
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) {
      if (k === marker) result = path;
      else visit(v, [...path, Array.isArray(node) ? Number(k) : k]);
    }
  };
  try { visit(parsed.toJS({ maxAliasCount: 50 }), []); } catch { return; }
  return result ? { path: result, value, startColumn: (value ? valueMatch![0].length : keyMatch![1].length) + 1 } : undefined;
}
export type Suggestion = { label: string; insertText: string; detail: string; documentation: string; snippet: boolean };
export function schemaSuggestions(bundle: SchemaBundle, text: string, line: number, column: number): { context: NonNullable<ReturnType<typeof completionContext>>; items: Suggestion[] } | undefined {
  const context = completionContext(text, line, column); if (!context) return;
  const schema = schemaAt(bundle, context.path);
  if (context.value) {
    const values = schema.enum || (schema.type === 'boolean' ? [true, false] : []);
    return { context, items: values.map((v: any) => ({ label: JSON.stringify(v), insertText: stringify(v).trimEnd(), detail: schema.type || 'value', documentation: schema.description || '', snippet: false })) };
  }
  let existing: any;
  try { existing = atPath(parseDocument(text).toJS({ maxAliasCount: 50 }), context.path); } catch { /* Incomplete draft is normal. */ }
  return { context, items: Object.entries(schema.properties || {}).filter(([key, prop]) => !(prop as Schema).readOnly && key !== 'status' && !Object.prototype.hasOwnProperty.call(existing || {}, key)).map(([key, raw]) => {
    const prop = resolveSchema(raw as Schema, bundle.document);
    const example = prop.default !== undefined ? ` Default: ${JSON.stringify(prop.default)}.` : '';
    const choices = prop.enum ? ` Allowed: ${prop.enum.map((v: any) => JSON.stringify(v)).join(', ')}.` : '';
    // A snippet placeholder becomes text only after explicit acceptance; no defaults are silently applied.
    return { label: key, insertText: `${key}: \${1}`, snippet: true, detail: `${prop.type || 'object'}${schema.required?.includes(key) ? ' · required' : ' · optional'}`, documentation: `${prop.description || ''}${choices}${example}` };
  }) };
}

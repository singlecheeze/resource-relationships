import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completionContext, schemaSuggestions, SchemaBundle } from '../src/lib/schema';
const bundle: SchemaBundle = { source: 'test', root: { properties: { spec: { $ref: '#/components/schemas/Spec' } } }, document: { components: { schemas: { Spec: { properties: { replicas: { type: 'integer', default: 1 }, mode: { type: 'string', enum: ['on', 'off'] }, enabled: { type: 'boolean' }, ports: { type: 'array', items: { properties: { port: { type: 'integer' }, name: { type: 'string' } } } } }, required: ['replicas'] } } } } };
test('schema suggestions resolve local refs, exclude existing keys and never mutate text', () => {
  const text = 'spec:\n  mode: "on"\n  re';
  const result = schemaSuggestions(bundle, text, 3, 5)!;
  assert.deepEqual(result.context.path, ['spec']);
  assert.ok(result.items.some(i => i.label === 'replicas' && /required/.test(i.detail)));
  assert.ok(!result.items.some(i => i.label === 'mode'));
  assert.equal(result.items.find(i => i.label === 'replicas')!.insertText, 'replicas: ${1}');
  assert.equal(text, 'spec:\n  mode: "on"\n  re');
});
test('schema enum values are YAML quoted and booleans remain booleans', () => {
  assert.deepEqual(schemaSuggestions(bundle, 'spec:\n  mode: ', 2, 9)!.items.map(i => i.label), ['"on"', '"off"']);
  assert.deepEqual(schemaSuggestions(bundle, 'spec:\n  enabled: ', 2, 12)!.items.map(i => i.insertText), ['true', 'false']);
});
test('array item context follows items schema and ignores comments/block-scalar body', () => {
  const text = 'spec:\n  ports:\n    - port: 80\n      na';
  assert.deepEqual(completionContext(text, 4, 9)!.path, ['spec', 'ports', 0]);
  assert.ok(schemaSuggestions(bundle, text, 4, 9)!.items.some(i => i.label === 'name'));
  assert.equal(completionContext('spec: # comment', 1, 16), undefined);
  assert.equal(completionContext('data: |\n  hello', 2, 8), undefined);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editableYaml, parseEdit } from '../src/lib/editor';
import { Resource } from '../src/lib/model';
const original: Resource = { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'settings', namespace: 'demo', uid: 'abc', resourceVersion: '12', managedFields: [{ manager: 'test' }] }, data: { greeting: 'hello' }, status: { sample: true } };
test('editor hides server-managed fields and preserves them on write', () => {
  const text = editableYaml(original);
  assert.ok(!text.includes('managedFields:') && !text.includes('status:'));
  const next = parseEdit(text.replace('hello', 'welcome'), original);
  assert.equal(next.data.greeting, 'welcome');
  assert.deepEqual(next.status, original.status);
  assert.deepEqual(next.metadata.managedFields, original.metadata.managedFields);
  assert.equal(next.metadata.resourceVersion, '12');
});
test('identity and concurrency tokens cannot be changed', () => {
  for (const [old, replacement] of [['settings', 'renamed'], ['abc', 'new-uid'], ['"12"', '"13"'], ['namespace: demo', 'namespace: elsewhere'], ['kind: ConfigMap', 'kind: Secret']]) {
    const text = editableYaml(original);
    assert.notEqual(text.replace(old, replacement), text);
    assert.throws(() => parseEdit(text.replace(old, replacement), original), /cannot be changed/);
  }
});
test('rejects duplicate keys, multiple documents, invalid YAML and status edits', () => {
  assert.throws(() => parseEdit('metadata: {}\nmetadata: {}', original));
  assert.throws(() => parseEdit(editableYaml(original) + '\n---\na: b', original));
  assert.throws(() => parseEdit('data: [', original));
  assert.throws(() => parseEdit(editableYaml(original) + '\nstatus: {}', original), /server-managed/);
});

test('unfilled mapping placeholders cannot be validated/saved; explicit null and empty strings remain intentional', () => {
  const text = editableYaml(original);
  assert.throws(() => parseEdit(text + '\noptional: ', original), /Empty suggestion placeholders/);
  assert.throws(() => parseEdit(text + '\noptional: # fill later', original), /Empty suggestion placeholders/);
  assert.equal(parseEdit(text + '\noptional: null', original).optional, null);
  assert.equal(parseEdit(text + '\noptional: ""', original).optional, '');
  assert.equal(parseEdit(text + '\noptional: |\n', original).optional, '');
});

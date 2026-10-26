import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resourceHelp } from '../src/lib/resource-help';
import { ResourceType } from '../src/lib/model';
const type: ResourceType = { kind: 'Deployment', group: 'apps', apiVersion: 'apps/v1', version: 'v1', plural: 'deployments', namespaced: true, verbs: [] };
test('kind help respects API group and uses schema descriptions for custom APIs', () => {
  assert.match(resourceHelp(type).text, /ReplicaSets/);
  const custom = { ...type, group: 'example.com', apiVersion: 'example.com/v1' };
  assert.doesNotMatch(resourceHelp(custom).text, /ReplicaSets/);
  const schema = { root: { $ref: '#/components/schemas/Custom' }, document: { components: { schemas: { Custom: { description: 'Manages demo resources.' } } } }, source: 'OpenAPI' };
  assert.equal(resourceHelp(custom, schema).text, 'Manages demo resources.');
  assert.equal(resourceHelp(custom, schema).source, 'Description published by this API schema');
  assert.match(resourceHelp(custom).text, /No kind-specific description/);
});

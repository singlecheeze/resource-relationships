import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import { exampleCatalog, resourceExamples } from '../src/lib/resource-examples';
test('every described built-in kind has 3–5 examples and unrelated custom kinds do not inherit them', () => {
  const help = readFileSync('src/lib/resource-help.ts', 'utf8');
  const keys = [...help.matchAll(/^  '([^']+)': '/gm)].map(m => m[1]);
  for (const key of keys) {
    const split = key.lastIndexOf('/');
    const result = resourceExamples({ group: key.slice(0, split), kind: key.slice(split + 1) });
    assert.ok(result.examples.length >= 3 && result.examples.length <= 5, key);
  }
  assert.equal(resourceExamples({ group: 'unrelated.example.com', kind: 'Deployment' }).examples.length, 0);
});
test('every recipe parses as one YAML mapping and has a source, note and unique ID', () => {
  const ids = new Set<string>();
  for (const examples of Object.values(exampleCatalog)) for (const example of examples) {
    const doc = parseDocument(example.yaml, { uniqueKeys: true });
    assert.deepEqual(doc.errors, [], example.id);
    const object = doc.toJS();
    assert.ok(object && typeof object === 'object' && !Array.isArray(object), example.id);
    assert.ok(!ids.has(example.id)); ids.add(example.id);
    assert.match(example.source, /^https:\/\//); assert.ok(example.note && example.title);
    if (example.format === 'manifest') {
      assert.equal(object.kind, example.kind); assert.equal(object.apiVersion, example.apiVersion); assert.ok(object.metadata.name);
    } else assert.match(example.yaml, /not a complete manifest/);
  }
});
test('NMState examples target one example node and distinguish VLAN and host MTU configuration', () => {
  const examples = resourceExamples({ group: 'nmstate.io', kind: 'NodeNetworkConfigurationPolicy' }).examples;
  assert.equal(examples.length, 5);
  for (const example of examples) {
    const object = parseDocument(example.yaml).toJS();
    assert.equal(object.spec.nodeSelector['kubernetes.io/hostname'], 'example-worker');
    assert.equal(example.format, 'manifest');
  }
  const vlan = parseDocument(examples.find(e => e.title.includes('VLAN 100'))!.yaml).toJS();
  assert.equal(vlan.spec.desiredState.interfaces[0].vlan.id, 100);
  const mtu = examples.find(e => e.title.includes('MTU'))!;
  assert.equal(parseDocument(mtu.yaml).toJS().spec.desiredState.interfaces[0].mtu, 9000);
  assert.match(mtu.note, /not a cluster overlay/);
});
test('state resources explicitly show configuration examples for the correct related kind', () => {
  for (const kind of ['NodeNetworkState', 'NodeNetworkConfigurationEnactment']) {
    const result = resourceExamples({ group: 'nmstate.io', kind });
    assert.ok(result.explanation);
    assert.ok(result.examples.every(e => e.kind === 'NodeNetworkConfigurationPolicy'));
    assert.ok(result.examples.every(e => !parseDocument(e.yaml).toJS().status));
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, walkGraph } from '../src/lib/graph';
import { LoadedResource } from '../src/lib/model';
const r = (kind: string, name: string, uid: string, spec: any = {}, extra: any = {}, ns = 'demo'): LoadedResource => ({
  type: { apiVersion: 'v1', group: '', version: 'v1', kind, plural: kind.toLowerCase() + 's', namespaced: true, verbs: ['get', 'list', 'update'] },
  object: { apiVersion: 'v1', kind, metadata: { name, namespace: ns, uid, resourceVersion: '1', ...extra }, spec },
});
test('ownership uses UID and does not accidentally join a recreated owner', () => {
  const owner = r('ReplicaSet', 'rs', 'new');
  const pod = r('Pod', 'p', 'p', {}, { ownerReferences: [{ uid: 'old', kind: 'ReplicaSet', name: 'rs', apiVersion: 'apps/v1' }] });
  const graph = buildGraph([owner, pod]);
  assert.equal(graph.edges.length, 0);
  assert.match(graph.unresolved.get('p')!.join(), /owner UID/);
});
test('service selection stays in namespace, and selector-less service selects nothing', () => {
  const graph = buildGraph([r('Service', 'svc', 's', { selector: { app: 'a' } }), r('Service', 'external', 'e'), r('Pod', 'a', 'a', {}, { labels: { app: 'a' } }), r('Pod', 'b', 'b', {}, { labels: { app: 'a' } }, 'other')]);
  assert.deepEqual(graph.edges.map(e => [e.from, e.to, e.relation]), [['s', 'a', 'selects']]);
});
test('pod references bind to namespace and PVC binds to a cluster volume', () => {
  const pv = r('PersistentVolume', 'disk', 'v', {}, {}, '');
  const claim = r('PersistentVolumeClaim', 'data', 'c', { volumeName: 'disk' });
  const pod = r('Pod', 'p', 'p', { volumes: [{ name: 'data', persistentVolumeClaim: { claimName: 'data' } }], containers: [{ name: 'c', envFrom: [{ secretRef: { name: 'private' } }] }] });
  const graph = buildGraph([pv, claim, pod]);
  assert.ok(graph.edges.some(e => e.from === 'p' && e.to === 'c' && e.relation === 'mounts'));
  assert.ok(graph.edges.some(e => e.from === 'c' && e.to === 'v' && e.relation === 'bound to'));
  assert.match(graph.unresolved.get('p')!.join(), /Secret demo\/private/);
});
test('cycles terminate, and depth/budget are enforced', () => {
  const graph = buildGraph([r('Pod', 'a', 'a'), r('Pod', 'b', 'b')]);
  graph.edges = [{ from: 'a', to: 'b', relation: 'uses', evidence: 'test' }, { from: 'b', to: 'a', relation: 'uses', evidence: 'test' }];
  assert.equal(walkGraph(graph, 'a', 'out', 4).children[0].children[0].cycle, true);
  assert.equal(walkGraph(graph, 'a', 'out', 1).children[0].children.length, 0);
  assert.equal(walkGraph(graph, 'a', 'out', 4, 1).children.length, 0);
  assert.equal(walkGraph(graph, 'a', 'in').children[0].uid, 'b');
});
test('ownership chain traverses forward and backward', () => {
  const dep = r('Deployment', 'web', 'dep');
  const rs = r('ReplicaSet', 'web-abc', 'rs', {}, { ownerReferences: [{ uid: 'dep', name: 'web', kind: 'Deployment', apiVersion: 'apps/v1' }] });
  const pod = r('Pod', 'web-abc-1', 'pod', {}, { ownerReferences: [{ uid: 'rs', name: 'web-abc', kind: 'ReplicaSet', apiVersion: 'apps/v1' }] });
  const graph = buildGraph([dep, rs, pod]);
  assert.equal(walkGraph(graph, 'dep', 'out').children[0].children[0].uid, 'pod');
  assert.equal(walkGraph(graph, 'pod', 'in').children[0].children[0].uid, 'dep');
});

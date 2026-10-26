import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../src/lib/graph';
import { matchesSelector, networkGroup } from '../src/lib/networking';
import { LoadedResource } from '../src/lib/model';
function r(apiVersion: string, kind: string, name: string, spec: any = {}, ns = 'demo', meta: any = {}, extra: any = {}): LoadedResource {
  const group = apiVersion.includes('/') ? apiVersion.split('/')[0] : '';
  return { type: { apiVersion, group, version: apiVersion.split('/').at(-1)!, kind, plural: kind.toLowerCase() + 's', namespaced: Boolean(ns), verbs: ['list', 'get'] },
    object: { apiVersion, kind, metadata: { name, namespace: ns || undefined, uid: name + '-' + kind, resourceVersion: '1', ...meta }, spec, ...extra } };
}
const has = (g: ReturnType<typeof buildGraph>, from: LoadedResource, to: LoadedResource, rel: string) => g.edges.some(e => e.from === from.object.metadata.uid && e.to === to.object.metadata.uid && e.relation === rel);
test('selectors handle matchExpressions, empty and absent selectors, including NotIn absent key', () => {
  assert.equal(matchesSelector({}, {}), true);
  assert.equal(matchesSelector(undefined, {}), false);
  assert.equal(matchesSelector({ matchExpressions: [{ key: 'role', operator: 'In', values: ['gpu'] }] }, { role: 'gpu' }), true);
  assert.equal(matchesSelector({ matchExpressions: [{ key: 'role', operator: 'NotIn', values: ['gpu'] }] }, {}), true);
  assert.equal(matchesSelector({ matchExpressions: [{ key: 'role', operator: 'Exists' }] }, {}), false);
  assert.equal(matchesSelector({ matchExpressions: [{ key: 'role', operator: 'DoesNotExist' }] }, {}), true);
  assert.equal(matchesSelector({ matchExpressions: [{ key: 'role', operator: 'Unknown' }] }, {}), false);
});
test('Gateway route follows cross-namespace parent and backend without claiming authorization', () => {
  const gateway = r('gateway.networking.k8s.io/v1', 'Gateway', 'gw', {}, 'infra');
  const service = r('v1', 'Service', 'backend');
  const route = r('gateway.networking.k8s.io/v1', 'HTTPRoute', 'route', { parentRefs: [{ name: 'gw', namespace: 'infra', sectionName: 'https' }], rules: [{ backendRefs: [{ name: 'backend', port: 80 }] }] });
  const graph = buildGraph([gateway, service, route]);
  assert.ok(has(graph, gateway, route, 'referenced by route'));
  assert.ok(has(graph, route, service, 'configured backend'));
  assert.ok(graph.edges.some(e => /configured attachment/.test(e.evidence)));
});
test('policy peer namespace and pod selectors are ANDed and namespace isolation is preserved', () => {
  const ns = r('v1', 'Namespace', 'demo', {}, '', { labels: { team: 'a' } });
  const other = r('v1', 'Namespace', 'other', {}, '', { labels: { team: 'b' } });
  const a = r('v1', 'Pod', 'a', {}, 'demo', { labels: { app: 'web' } });
  const b = r('v1', 'Pod', 'b', {}, 'other', { labels: { app: 'web' } });
  const policy = r('networking.k8s.io/v1', 'NetworkPolicy', 'np', { podSelector: {}, ingress: [{ from: [{ namespaceSelector: { matchLabels: { team: 'b' } }, podSelector: { matchLabels: { app: 'web' } } }] }] });
  const graph = buildGraph([ns, other, a, b, policy]);
  assert.ok(has(graph, policy, a, 'policy selects'));
  assert.ok(!has(graph, policy, b, 'policy selects'));
  assert.ok(has(graph, policy, b, 'ingress peer selector matches'));
  assert.ok(!has(graph, policy, a, 'ingress peer selector matches'));
});
test('egress desired selectors and observed node assignment are distinct', () => {
  const ns = r('v1', 'Namespace', 'demo', {}, '', { labels: { team: 'a' } });
  const pod = r('v1', 'Pod', 'pod');
  const node = r('v1', 'Node', 'ocp113', {}, '');
  const eip = r('k8s.ovn.org/v1', 'EgressIP', 'egress', { namespaceSelector: { matchLabels: { team: 'a' } } }, '', {}, { status: { items: [{ node: 'ocp113', egressIP: '192.0.2.30' }] } });
  const graph = buildGraph([ns, pod, node, eip]);
  assert.ok(has(graph, eip, pod, 'egress selector matches'));
  assert.ok(has(graph, eip, node, 'assigned egress node'));
  assert.ok(!has(buildGraph([pod, node, eip]), eip, pod, 'egress selector matches'));
});
test('Multus requested and reported attachments support text, JSON, and explicit namespaces', () => {
  const nad = r('k8s.cni.cncf.io/v1', 'NetworkAttachmentDefinition', 'rdma', {}, 'networks');
  const pod = r('v1', 'Pod', 'p', {}, 'demo', { annotations: { 'k8s.v1.cni.cncf.io/networks': 'networks/rdma@net1', 'k8s.v1.cni.cncf.io/network-status': JSON.stringify([{ name: 'networks/rdma', interface: 'net1', ips: ['172.16.101.4'] }]) } });
  const graph = buildGraph([pod, nad]);
  assert.ok(has(graph, pod, nad, 'requests network')); assert.ok(has(graph, pod, nad, 'reports attachment'));
  pod.object.metadata.annotations = { 'k8s.v1.cni.cncf.io/networks': '[broken' };
  assert.match(buildGraph([pod, nad]).unresolved.get(pod.object.metadata.uid)!.join(), /invalid annotation/);
});
test('NMState joins by selectors and documented labels, not guessed enactment names', () => {
  const node = r('v1', 'Node', 'ocp113', {}, '', { labels: { role: 'worker' } });
  const policy = r('nmstate.io/v1', 'NodeNetworkConfigurationPolicy', 'storage', { nodeSelector: { role: 'worker' } }, '');
  const enactment = r('nmstate.io/v1beta1', 'NodeNetworkConfigurationEnactment', 'anything', {}, '', { labels: { 'nmstate.io/node': 'ocp113', 'nmstate.io/policy': 'storage' } });
  const state = r('nmstate.io/v1beta1', 'NodeNetworkState', 'ocp113', {}, '');
  const graph = buildGraph([node, policy, enactment, state]);
  assert.ok(has(graph, policy, node, 'targets node')); assert.ok(has(graph, policy, enactment, 'has enactment'));
  assert.ok(has(graph, enactment, node, 'node enactment')); assert.ok(has(graph, node, state, 'observed network state'));
});
test('EndpointSlice uses UID and never joins a recreated pod by name', () => {
  const pod = r('v1', 'Pod', 'pod');
  const slice = r('discovery.k8s.io/v1', 'EndpointSlice', 'slice', {}, 'demo', {}, { endpoints: [{ addresses: ['10.0.0.1'], targetRef: { kind: 'Pod', name: 'pod', uid: 'old' }, conditions: { ready: false } }] });
  const graph = buildGraph([pod, slice]);
  assert.ok(!has(graph, slice, pod, 'endpoint for'));
  assert.match(graph.unresolved.get(slice.object.metadata.uid)!.join(), /UID old/);
});
test('network inventory grouping uses API group, not just kind', () => {
  assert.equal(networkGroup(r('v1', 'Service', 's')), 'Services & endpoints');
  assert.equal(networkGroup(r('example.com/v1', 'Service', 's')), undefined);
});

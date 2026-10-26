import { LoadedResource, Resource, typeKey } from './model';

export const networkGroups: Record<string, string[]> = {
  'Application access': ['routes.route.openshift.io', 'ingresses.networking.k8s.io', 'gateways.gateway.networking.k8s.io', 'httproutes.gateway.networking.k8s.io', 'grpcroutes.gateway.networking.k8s.io', 'tcproutes.gateway.networking.k8s.io', 'tlsroutes.gateway.networking.k8s.io', 'udproutes.gateway.networking.k8s.io', 'referencegrants.gateway.networking.k8s.io'],
  'Services & endpoints': ['services.core', 'endpointslices.discovery.k8s.io', 'endpoints.core'],
  'Network policies': ['networkpolicies.networking.k8s.io', 'adminnetworkpolicies.policy.networking.k8s.io', 'baselineadminnetworkpolicies.policy.networking.k8s.io'],
  'Secondary & user-defined networks': ['network-attachment-definitions.k8s.cni.cncf.io', 'userdefinednetworks.k8s.ovn.org', 'clusteruserdefinednetworks.k8s.ovn.org'],
  'Egress': ['egressips.k8s.ovn.org', 'egressfirewalls.k8s.ovn.org', 'egressqoses.k8s.ovn.org', 'egressservices.k8s.ovn.org', 'adminpolicybasedexternalroutes.k8s.ovn.org'],
  'Infrastructure': ['nodes.core', 'namespaces.core', 'ingresscontrollers.operator.openshift.io', 'ingressclasses.networking.k8s.io', 'gatewayclasses.gateway.networking.k8s.io', 'nodenetworkconfigurationpolicies.nmstate.io', 'nodenetworkconfigurationenactments.nmstate.io', 'nodenetworkstates.nmstate.io', 'networks.config.openshift.io', 'networks.operator.openshift.io', 'dnses.config.openshift.io', 'dnses.operator.openshift.io', 'sriovnetworknodepolicies.sriovnetwork.openshift.io', 'sriovnetworknodestates.sriovnetwork.openshift.io', 'sriovnetworks.sriovnetwork.openshift.io'],
};
export const networkTypes = new Set(Object.values(networkGroups).flat());
export const networkGroup = (r: LoadedResource) => Object.entries(networkGroups).find(([, keys]) => keys.includes(typeKey(r.type)))?.[0];
/** Kubernetes LabelSelector semantics; undefined is deliberately not treated as match-all. */
export function matchesSelector(selector: any, labels: Record<string, string> = {}): boolean {
  if (!selector || typeof selector !== 'object') return false;
  return Object.entries(selector.matchLabels || {}).every(([k, v]) => labels[k] === v) &&
    (selector.matchExpressions || []).every((e: any) => {
      const exists = Object.prototype.hasOwnProperty.call(labels, e.key);
      switch (e.operator) {
        case 'In': return exists && e.values?.includes(labels[e.key]);
        case 'NotIn': return !exists || !e.values?.includes(labels[e.key]);
        case 'Exists': return exists;
        case 'DoesNotExist': return !exists;
        default: return false;
      }
    });
}
export type NetworkLinks = {
  edge: (from: string, to: string, relation: string, evidence: string) => void;
  ref: (o: Resource, group: string, kind: string, name: string | undefined, relation: string, evidence: string, namespace?: string) => void;
  missing: (uid: string, text: string) => void;
};
export function addNetworkRelationships(resources: LoadedResource[], { edge, ref, missing }: NetworkLinks) {
  const objects = resources.map(r => r.object);
  const pods = objects.filter(o => o.apiVersion === 'v1' && o.kind === 'Pod');
  const nodes = objects.filter(o => o.apiVersion === 'v1' && o.kind === 'Node');
  const namespaces = objects.filter(o => o.apiVersion === 'v1' && o.kind === 'Namespace');
  const namespaceMatches = (o: Resource, selector: any, ns: string | undefined) => {
    const namespace = namespaces.find(n => n.metadata.name === ns);
    if (!namespace) { missing(o.metadata.uid, `Namespace ${ns}: labels not loaded; namespace selector cannot be evaluated`); return false; }
    return matchesSelector(selector, namespace.metadata.labels);
  };
  const linkPods = (o: Resource, predicate: (p: Resource) => boolean, relation: string, evidence: string) =>
    pods.filter(predicate).forEach(p => edge(o.metadata.uid, p.metadata.uid, relation, evidence));
  for (const o of objects) {
    const s = o.spec || {}, uid = o.metadata.uid, ns = o.metadata.namespace;
    const group = o.apiVersion.includes('/') ? o.apiVersion.split('/')[0] : '';
    const is = (g: string, ...k: string[]) => group === g && k.includes(o.kind);
    if (is('gateway.networking.k8s.io', 'Gateway')) ref(o, group, 'GatewayClass', s.gatewayClassName, 'uses class', 'spec.gatewayClassName', '');
    if (is('gateway.networking.k8s.io', 'HTTPRoute', 'GRPCRoute', 'TCPRoute', 'TLSRoute', 'UDPRoute')) {
      for (const p of s.parentRefs || []) {
        const kind = p.kind || 'Gateway', g = p.group ?? 'gateway.networking.k8s.io';
        const evidence = `spec.parentRefs${p.sectionName ? ` listener=${p.sectionName}` : ''}; configured attachment (see status.parents for acceptance)`;
        ref(o, g, kind, p.name, 'requests attachment to', evidence, p.namespace || ns);
        const target = objects.find(x => x.kind === kind && x.apiVersion.split('/')[0] === g && x.metadata.name === p.name && x.metadata.namespace === (p.namespace || ns));
        if (target) edge(target.metadata.uid, uid, 'referenced by route', evidence);
      }
      for (const rule of s.rules || []) for (const b of rule.backendRefs || []) {
        ref(o, b.group || '', b.kind || 'Service', b.name, 'configured backend', `spec.rules.backendRefs port=${b.port ?? 'unspecified'} weight=${b.weight ?? 1}; cross-namespace permission and route status must be checked`, b.namespace || ns);
      }
    }
    if (is('networking.k8s.io', 'Ingress')) ref(o, 'networking.k8s.io', 'IngressClass', s.ingressClassName, 'uses class', 'spec.ingressClassName', '');
    if (is('discovery.k8s.io', 'EndpointSlice')) {
      const service = objects.find(x => x.apiVersion === 'v1' && x.kind === 'Service' && x.metadata.namespace === ns && x.metadata.name === o.metadata.labels?.['kubernetes.io/service-name']);
      if (service) edge(service.metadata.uid, uid, 'endpoint discovery', 'metadata.labels.kubernetes.io/service-name');
      for (const e of o.endpoints || []) if (!e.targetRef) missing(uid, `Endpoint ${e.addresses?.join(', ')} ready=${String(e.conditions?.ready ?? 'unknown')}; no object targetRef`);
    }
    if (is('networking.k8s.io', 'NetworkPolicy')) {
      linkPods(o, p => p.metadata.namespace === ns && matchesSelector(s.podSelector, p.metadata.labels), 'policy selects', 'spec.podSelector; selection is not a reachability verdict');
      for (const direction of ['ingress', 'egress']) for (const [i, rule] of (s[direction] || []).entries()) {
        for (const peer of rule[direction === 'ingress' ? 'from' : 'to'] || []) {
          if (peer.ipBlock) { missing(uid, `${direction}[${i}] IP block ${peer.ipBlock.cidr}; except ${(peer.ipBlock.except || []).join(', ') || 'none'} (CIDR, not a Kubernetes object)`); continue; }
          linkPods(o, p => (peer.namespaceSelector !== undefined ? namespaceMatches(o, peer.namespaceSelector, p.metadata.namespace) : p.metadata.namespace === ns) && matchesSelector(peer.podSelector ?? {}, p.metadata.labels), `${direction} peer selector matches`, `spec.${direction}[${i}]; ports and all applicable policies still apply`);
        }
      }
    }
    if (is('policy.networking.k8s.io', 'AdminNetworkPolicy', 'BaselineAdminNetworkPolicy')) {
      const subject = s.subject || {};
      linkPods(o, p => subject.namespaces !== undefined ? namespaceMatches(o, subject.namespaces, p.metadata.namespace) : subject.pods !== undefined && namespaceMatches(o, subject.pods.namespaceSelector, p.metadata.namespace) && matchesSelector(subject.pods.podSelector, p.metadata.labels), 'policy subject', 'spec.subject; inspect ordered rules/actions in YAML');
    }
    if (o.apiVersion === 'v1' && o.kind === 'Pod') {
      const annotations = o.metadata.annotations as Record<string, string> | undefined;
      for (const [key, relation] of [['k8s.v1.cni.cncf.io/networks', 'requests network'], ['k8s.v1.cni.cncf.io/network-status', 'reports attachment']] as const) {
        const value = annotations?.[key]; if (!value) continue;
        try {
          const entries = value.trim().startsWith('[') || value.trim().startsWith('{') ? JSON.parse(value) : value.split(',').map(name => name.trim());
          for (const entry of Array.isArray(entries) ? entries : [entries]) {
            const name = typeof entry === 'string' ? entry.split('@')[0] : entry.name;
            if (!name) continue;
            const parts = name.split('/');
            ref(o, 'k8s.cni.cncf.io', 'NetworkAttachmentDefinition', parts.at(-1), relation, `${key}${entry.interface ? ` interface=${entry.interface}` : ''}${entry.ips ? ` ips=${entry.ips.join(',')}` : ''}; default CNI may have no NAD`, parts.length > 1 ? parts[0] : entry.namespace || ns);
          }
        } catch { missing(uid, `${key}: invalid annotation; cannot resolve network references`); }
      }
    }
    if (is('k8s.ovn.org', 'ClusterUserDefinedNetwork')) {
      namespaces.filter(n => matchesSelector(s.namespaceSelector, n.metadata.labels)).forEach(n => edge(uid, n.metadata.uid, 'selects namespace', 'spec.namespaceSelector; generated NAD ownership shown separately'));
    }
    if (is('k8s.ovn.org', 'EgressIP')) {
      linkPods(o, p => namespaceMatches(o, s.namespaceSelector, p.metadata.namespace) && matchesSelector(s.podSelector ?? {}, p.metadata.labels), 'egress selector matches', 'spec.namespaceSelector AND spec.podSelector; not a connectivity verdict');
      for (const a of o.status?.items || []) ref(o, '', 'Node', a.node, 'assigned egress node', `status.items egressIP=${a.egressIP}`, '');
    }
    if (is('k8s.ovn.org', 'EgressFirewall')) {
      linkPods(o, p => p.metadata.namespace === ns, 'namespace egress policy', 'EgressFirewall namespace scope; rule ordering matters');
      for (const [i, rule] of (s.egress || []).entries()) missing(uid, `Egress rule ${i}: ${rule.type} ${JSON.stringify(rule.to)} ports=${JSON.stringify(rule.ports || [])} (destination rule, not proof of connectivity)`);
    }
    if (is('k8s.ovn.org', 'EgressQoS')) for (const [i, rule] of (s.egress || []).entries()) linkPods(o, p => p.metadata.namespace === ns && matchesSelector(rule.podSelector ?? {}, p.metadata.labels), 'QoS selector matches', `spec.egress[${i}] dscp=${rule.dscp} dstCIDR=${rule.dstCIDR || 'all'}`);
    if (is('k8s.ovn.org', 'EgressService')) {
      ref(o, '', 'Service', o.metadata.name, 'configures egress for', 'EgressService and Service share name/namespace by API contract');
      if (o.status?.host && o.status.host !== 'ALL') ref(o, '', 'Node', o.status.host, 'assigned host', 'status.host', '');
      nodes.filter(n => matchesSelector(s.nodeSelector ?? {}, n.metadata.labels)).forEach(n => edge(uid, n.metadata.uid, 'eligible host', 'spec.nodeSelector; not an assignment'));
    }
    if (is('k8s.ovn.org', 'AdminPolicyBasedExternalRoute')) {
      namespaces.filter(n => matchesSelector(s.from?.namespaceSelector, n.metadata.labels)).forEach(n => edge(uid, n.metadata.uid, 'egress source namespace', 'spec.from.namespaceSelector'));
      for (const hop of s.nextHops?.dynamic || []) linkPods(o, p => namespaceMatches(o, hop.namespaceSelector, p.metadata.namespace) && matchesSelector(hop.podSelector, p.metadata.labels), 'dynamic next hop selector', 'spec.nextHops.dynamic; see status for application');
      for (const hop of s.nextHops?.static || []) missing(uid, `Static next hop ${hop.ip} (external address)`);
    }
    if (is('nmstate.io', 'NodeNetworkConfigurationPolicy')) nodes.filter(n => matchesSelector({ matchLabels: s.nodeSelector || {} }, n.metadata.labels)).forEach(n => edge(uid, n.metadata.uid, 'targets node', 'spec.nodeSelector; desired configuration, inspect enactment status'));
    if (is('nmstate.io', 'NodeNetworkConfigurationEnactment')) {
      ref(o, '', 'Node', o.metadata.labels?.['nmstate.io/node'], 'node enactment', 'metadata.labels.nmstate.io/node', '');
      ref(o, 'nmstate.io', 'NodeNetworkConfigurationPolicy', o.metadata.labels?.['nmstate.io/policy'], 'enacts policy', 'metadata.labels.nmstate.io/policy', '');
      const policy = objects.find(x => x.kind === 'NodeNetworkConfigurationPolicy' && x.apiVersion.startsWith('nmstate.io/') && x.metadata.name === o.metadata.labels?.['nmstate.io/policy']);
      if (policy) edge(policy.metadata.uid, uid, 'has enactment', 'metadata.labels.nmstate.io/policy');
    }
    if (is('nmstate.io', 'NodeNetworkState') || is('sriovnetwork.openshift.io', 'SriovNetworkNodeState')) {
      ref(o, '', 'Node', o.metadata.name, 'reports node state', 'node-state resource name identifies node by API contract', '');
      const node = nodes.find(n => n.metadata.name === o.metadata.name);
      if (node) edge(node.metadata.uid, uid, 'observed network state', 'node-state resource name identifies node by API contract');
    }
    if (is('sriovnetwork.openshift.io', 'SriovNetworkNodePolicy')) nodes.filter(n => matchesSelector({ matchLabels: s.nodeSelector || {} }, n.metadata.labels)).forEach(n => edge(uid, n.metadata.uid, 'targets node', 'spec.nodeSelector; NIC selection is in spec.nicSelector'));
    if (is('sriovnetwork.openshift.io', 'SriovNetwork')) ref(o, 'k8s.cni.cncf.io', 'NetworkAttachmentDefinition', o.metadata.name, 'generates attachment', 'spec.networkNamespace and same-name generated NAD', s.networkNamespace || ns);
    if (is('operator.openshift.io', 'IngressController')) {
      for (const route of objects.filter(x => x.kind === 'Route' && x.apiVersion.startsWith('route.openshift.io/'))) {
        if ((route.status?.ingress || []).some((entry: any) => entry.routerName === o.metadata.name && entry.conditions?.some((c: any) => c.type === 'Admitted' && c.status === 'True'))) edge(uid, route.metadata.uid, 'admitted route', 'Route.status.ingress routerName and Admitted=True');
      }
      const placement = s.nodePlacement?.nodeSelector;
      if (placement) nodes.filter(n => matchesSelector(placement, n.metadata.labels)).forEach(n => edge(uid, n.metadata.uid, 'placement selector matches', 'spec.nodePlacement.nodeSelector; does not prove a router pod is scheduled'));
    }
  }
}

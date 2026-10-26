import { Edge, Graph, LoadedResource, Resource } from './model';
import { addNetworkRelationships } from './networking';

/** Ownership is joined on UID, never on a coincidentally reused name. */
export function buildGraph(resources: LoadedResource[]): Graph {
  const nodes = new Map(resources.map(r => [r.object.metadata.uid, r]));
  const index = new Map<string, string>();
  const edges: Edge[] = [];
  const unresolved = new Map<string, string[]>();
  const seen = new Set<string>();
  const group = (api: string) => api.includes('/') ? api.split('/')[0] : '';
  const key = (g: string, k: string, ns: string | undefined, n: string) => `${g}|${k}|${ns || ''}|${n}`;
  resources.forEach(({ object: o }) => index.set(key(group(o.apiVersion), o.kind, o.metadata.namespace, o.metadata.name), o.metadata.uid));
  const missing = (uid: string, text: string) => { const values = unresolved.get(uid) || []; if (!values.includes(text)) unresolved.set(uid, [...values, text]); };
  const edge = (from: string, to: string, relation: string, evidence: string) => {
    const id = `${from}|${to}|${relation}|${evidence}`;
    if (!seen.has(id)) { seen.add(id); edges.push({ from, to, relation, evidence }); }
  };
  const ref = (o: Resource, g: string, kind: string, name: string | undefined, relation: string, evidence: string, ns: string | undefined = o.metadata.namespace) => {
    if (!name) return;
    const uid = index.get(key(g, kind, ns, name));
    if (uid) edge(o.metadata.uid, uid, relation, evidence);
    else missing(o.metadata.uid, `${relation}: ${kind} ${ns ? ns + '/' : ''}${name} (${evidence}; not loaded or not accessible)`);
  };
  for (const { object: o } of resources) {
    const uid = o.metadata.uid;
    for (const owner of o.metadata.ownerReferences || []) {
      if (nodes.has(owner.uid)) edge(owner.uid, uid, 'owns', 'metadata.ownerReferences.uid');
      else missing(uid, `Owned by ${owner.kind} ${owner.name} (owner UID not in loaded scope)`);
    }
    const s = o.spec || {};
    if (o.kind === 'Pod' && o.apiVersion === 'v1') {
      ref(o, '', 'Node', s.nodeName, 'runs on', 'spec.nodeName', '');
      ref(o, '', 'ServiceAccount', s.serviceAccountName || 'default', 'uses', 'spec.serviceAccountName');
      for (const v of s.volumes || []) {
        ref(o, '', 'PersistentVolumeClaim', v.persistentVolumeClaim?.claimName, 'mounts', `spec.volumes.${v.name}.persistentVolumeClaim`);
        ref(o, '', 'ConfigMap', v.configMap?.name, 'uses', `spec.volumes.${v.name}.configMap`);
        ref(o, '', 'Secret', v.secret?.secretName, 'uses', `spec.volumes.${v.name}.secret`);
        for (const p of v.projected?.sources || []) {
          ref(o, '', 'ConfigMap', p.configMap?.name, 'uses', 'spec.volumes.projected.configMap');
          ref(o, '', 'Secret', p.secret?.name, 'uses', 'spec.volumes.projected.secret');
        }
      }
      for (const c of [...(s.containers || []), ...(s.initContainers || []), ...(s.ephemeralContainers || [])]) {
        for (const e of c.env || []) {
          ref(o, '', 'ConfigMap', e.valueFrom?.configMapKeyRef?.name, 'uses', `${c.name}.env.configMapKeyRef`);
          ref(o, '', 'Secret', e.valueFrom?.secretKeyRef?.name, 'uses', `${c.name}.env.secretKeyRef`);
        }
        for (const e of c.envFrom || []) {
          ref(o, '', 'ConfigMap', e.configMapRef?.name, 'uses', `${c.name}.envFrom.configMapRef`);
          ref(o, '', 'Secret', e.secretRef?.name, 'uses', `${c.name}.envFrom.secretRef`);
        }
      }
      for (const r of s.imagePullSecrets || []) ref(o, '', 'Secret', r.name, 'uses', 'spec.imagePullSecrets');
    }
    if (o.kind === 'Service' && o.apiVersion === 'v1' && s.selector && Object.keys(s.selector).length) {
      for (const { object: pod } of resources) {
        if (pod.kind === 'Pod' && pod.apiVersion === 'v1' && pod.metadata.namespace === o.metadata.namespace &&
          Object.entries(s.selector).every(([k, v]) => pod.metadata.labels?.[k] === v)) {
          edge(uid, pod.metadata.uid, 'selects', `spec.selector ${JSON.stringify(s.selector)} (label match, not readiness)`);
        }
      }
    }
    if (o.kind === 'PersistentVolumeClaim' && o.apiVersion === 'v1') {
      ref(o, '', 'PersistentVolume', s.volumeName, 'bound to', 'spec.volumeName', '');
      ref(o, 'storage.k8s.io', 'StorageClass', s.storageClassName, 'uses', 'spec.storageClassName', '');
    }
    if (o.kind === 'PersistentVolume' && o.apiVersion === 'v1') {
      const claim = s.claimRef;
      if (claim?.uid && nodes.has(claim.uid)) edge(uid, claim.uid, 'claimed by', 'spec.claimRef.uid');
    }
    if (o.kind === 'Route' && group(o.apiVersion) === 'route.openshift.io') {
      for (const target of [s.to, ...(s.alternateBackends || [])]) {
        if (target && (!target.kind || target.kind === 'Service')) ref(o, '', 'Service', target.name, 'routes to', 'spec.to / spec.alternateBackends');
      }
    }
    if (o.kind === 'Ingress' && group(o.apiVersion) === 'networking.k8s.io') {
      for (const b of [s.defaultBackend, ...(s.rules || []).flatMap((r: any) => (r.http?.paths || []).map((p: any) => p.backend))])
        ref(o, '', 'Service', b?.service?.name, 'routes to', 'spec.defaultBackend / spec.rules.http.paths.backend');
    }
    if (o.kind === 'EndpointSlice' && group(o.apiVersion) === 'discovery.k8s.io') {
      ref(o, '', 'Service', o.metadata.labels?.['kubernetes.io/service-name'], 'belongs to', 'metadata.labels.kubernetes.io/service-name');
      for (const e of o.endpoints || []) {
        const t = e.targetRef;
        if (t?.uid) {
          if (nodes.has(t.uid)) edge(uid, t.uid, 'endpoint for', `endpoints.targetRef.uid; addresses=${e.addresses?.join(',')} ready=${String(e.conditions?.ready ?? 'unknown')}`);
          else missing(uid, `Endpoint target ${t.kind}/${t.name} UID ${t.uid} not loaded; addresses=${e.addresses?.join(',')}`);
        } else if (t?.name) ref(o, group(t.apiVersion || 'v1'), t.kind, t.name, 'endpoint for', 'endpoints.targetRef', t.namespace || o.metadata.namespace);
      }
    }
  }
  addNetworkRelationships(resources, { edge, ref, missing });
  return { nodes, edges, unresolved };
}

export type WalkNode = { uid: string; edge?: Edge; reverse?: boolean; cycle: boolean; children: WalkNode[] };
/** Bound graph expansion: shared targets repeat; cycles stop at the repeated node. */
export function walkGraph(graph: Graph, root: string, direction: 'out' | 'in', depth = 3, budget = 200): WalkNode {
  let remaining = budget;
  const visit = (uid: string, path: Set<string>, level: number, edge?: Edge): WalkNode => {
    const cycle = path.has(uid);
    const node: WalkNode = { uid, edge, reverse: direction === 'in', cycle, children: [] };
    remaining--;
    if (cycle || level >= depth || remaining <= 0) return node;
    const nextPath = new Set([...path, uid]);
    for (const e of graph.edges) {
      if (remaining <= 0) break;
      if ((direction === 'out' ? e.from : e.to) === uid)
        node.children.push(visit(direction === 'out' ? e.to : e.from, nextPath, level + 1, e));
    }
    return node;
  };
  return visit(root, new Set(), 0);
}

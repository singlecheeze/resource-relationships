import { networkTypes } from './networking';
import { consoleFetch } from '@openshift-console/dynamic-plugin-sdk';
import { collectionPath, LoadedResource, Resource, ResourceType, resourcePath, typeKey } from './model';

export async function request<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const flags = (window as any).SERVER_FLAGS;
  const base = String(flags?.basePath || '/').replace(/\/?$/, '/');
  const response = await consoleFetch(`${base}api/kubernetes${path}`, {
    ...init, headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  return response.json();
}
export const errorText = (error: unknown): string => {
  const e = error as any;
  const status = e?.response?.status || e?.status || e?.code;
  const text = e?.json?.message || e?.message || String(error);
  if (status === 409 || /Conflict|object has been modified/i.test(text)) return `Conflict: the object changed on the server. Your edits are retained. Copy them, reload the latest YAML, and reapply. ${text}`;
  return status ? `${status}: ${text}` : text;
};

async function pool<T, U>(items: T[], fn: (item: T) => Promise<U>): Promise<PromiseSettledResult<U>[]> {
  const result: PromiseSettledResult<U>[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(5, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try { result[i] = { status: 'fulfilled', value: await fn(items[i]) }; }
      catch (reason) { result[i] = { status: 'rejected', reason }; }
    }
  }));
  return result;
}
export async function discover(): Promise<{ types: ResourceType[]; warnings: string[] }> {
  const groups = await request('/apis');
  const versions = ['v1', ...groups.groups.map((g: any) => g.preferredVersion.groupVersion)] as string[];
  const results = await pool(versions, async apiVersion => {
    const list = await request(apiVersion === 'v1' ? '/api/v1' : `/apis/${apiVersion}`);
    const [group, version] = apiVersion.includes('/') ? apiVersion.split('/') : ['', apiVersion];
    return list.resources.filter((r: any) => !r.name.includes('/') && r.verbs?.includes('list') && r.verbs?.includes('get') && r.name !== 'secrets')
      .map((r: any): ResourceType => ({ apiVersion, group, version, plural: r.name, kind: r.kind, namespaced: r.namespaced, verbs: r.verbs }));
  });
  return {
    types: results.flatMap(r => r.status === 'fulfilled' ? r.value : []).sort((a, b) => typeKey(a).localeCompare(typeKey(b))),
    warnings: results.flatMap((r, i) => r.status === 'rejected' ? [`Discovery ${versions[i]}: ${errorText(r.reason)}`] : []),
  };
}
export const defaultTypes = new Set([
  ...networkTypes,
  'pods.core', 'services.core', 'persistentvolumeclaims.core', 'configmaps.core', 'serviceaccounts.core',
  'deployments.apps', 'replicasets.apps', 'statefulsets.apps', 'daemonsets.apps', 'jobs.batch', 'cronjobs.batch',
  'endpointslices.discovery.k8s.io', 'routes.route.openshift.io', 'ingresses.networking.k8s.io',
  'virtualmachines.kubevirt.io', 'virtualmachineinstances.kubevirt.io', 'datavolumes.cdi.kubevirt.io',
  'llminferenceservices.serving.kserve.io', 'inferenceservices.serving.kserve.io', 'leaderworkersets.leaderworkerset.x-k8s.io',
  'nodes.core', 'persistentvolumes.core', 'storageclasses.storage.k8s.io',
]);
export async function loadResources(types: ResourceType[], namespace: string, signal?: AbortSignal) {
  const results = await pool(types, async type => {
    const objects: LoadedResource[] = [];
    let token = '';
    do {
      const query = new URLSearchParams({ limit: '500' });
      if (token) query.set('continue', token);
      const list = await request(`${collectionPath(type, namespace)}?${query}`, { signal });
      for (const o of list.items || []) objects.push({ type, object: { ...o, kind: type.kind, apiVersion: type.apiVersion } });
      token = list.metadata?.continue || '';
      if (objects.length >= 2000) break;
    } while (token);
    return { objects: objects.slice(0, 2000), capped: Boolean(token) || objects.length > 2000 };
  });
  return {
    resources: results.flatMap(r => r.status === 'fulfilled' ? r.value.objects : []),
    warnings: results.flatMap((r, i) => r.status === 'rejected'
      ? [`${typeKey(types[i])}: ${errorText(r.reason)}`]
      : r.value.capped ? [`${typeKey(types[i])}: limited to 2,000 objects; relationships are incomplete.`] : []),
  };
}
export const getResource = async (r: LoadedResource) => ({ ...r, object: await request<Resource>(resourcePath(r)) });
export async function canUpdate(r: LoadedResource): Promise<boolean> {
  if (!r.type.verbs.includes('update')) return false;
  const review = await request('/apis/authorization.k8s.io/v1/selfsubjectaccessreviews', {
    method: 'POST', body: JSON.stringify({ apiVersion: 'authorization.k8s.io/v1', kind: 'SelfSubjectAccessReview', spec: { resourceAttributes: {
      group: r.type.group, version: r.type.version, resource: r.type.plural,
      namespace: r.object.metadata.namespace, name: r.object.metadata.name, verb: 'update',
    } } }),
  });
  return review.status?.allowed === true;
}
export const updateResource = (r: LoadedResource, object: Resource, dryRun: boolean) =>
  request<Resource>(`${resourcePath(r)}?fieldValidation=Strict${dryRun ? '&dryRun=All' : ''}`, { method: 'PUT', body: JSON.stringify(object) });

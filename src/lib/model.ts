export type Resource = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string; namespace?: string; uid: string; resourceVersion: string;
    labels?: Record<string, string>;
    ownerReferences?: { apiVersion: string; kind: string; name: string; uid: string }[];
    [key: string]: unknown;
  };
  spec?: any;
  status?: any;
  [key: string]: any;
};
export type ResourceType = {
  apiVersion: string; group: string; version: string;
  plural: string; kind: string; namespaced: boolean; verbs: string[];
};
export type LoadedResource = { object: Resource; type: ResourceType };
export type Edge = { from: string; to: string; relation: string; evidence: string };
export type Graph = { nodes: Map<string, LoadedResource>; edges: Edge[]; unresolved: Map<string, string[]> };
export const typeKey = (t: ResourceType) => `${t.plural}.${t.group || 'core'}`;
export const objectKey = (o: Resource) => o.metadata.uid;
export const collectionPath = (t: ResourceType, ns?: string) =>
  `${t.group ? `/apis/${t.group}/${t.version}` : `/api/${t.version}`}` +
  (t.namespaced && ns ? `/namespaces/${encodeURIComponent(ns)}` : '') + `/${t.plural}`;
export const resourcePath = (r: LoadedResource) =>
  `${collectionPath(r.type, r.object.metadata.namespace)}/${encodeURIComponent(r.object.metadata.name)}`;

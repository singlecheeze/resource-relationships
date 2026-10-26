import { request } from './api';
import { ResourceType } from './model';
import { Schema, SchemaBundle } from './schema';
export async function loadSchema(type: ResourceType): Promise<SchemaBundle> {
  let openAPIError: unknown;
  try {
    const index = await request('/openapi/v3');
    const path = type.group ? `apis/${type.group}/${type.version}` : `api/${type.version}`;
    const url = index.paths?.[path]?.serverRelativeURL;
    if (typeof url !== 'string' || !url.startsWith('/openapi/v3/')) throw new Error('No OpenAPI v3 document advertised for this API version');
    const document = await request(url);
    const root = Object.values(document.components?.schemas || {}).find((s: any) => s['x-kubernetes-group-version-kind']?.some((gvk: any) => gvk.group === type.group && gvk.version === type.version && gvk.kind === type.kind)) as Schema | undefined;
    if (root) return { root, document, source: `OpenAPI v3 · ${type.apiVersion} · ${type.kind}` };
    throw new Error('Resource schema is not published in OpenAPI v3');
  } catch (e) { openAPIError = e; }
  if (type.group) {
    const crd = await request(`/apis/apiextensions.k8s.io/v1/customresourcedefinitions/${encodeURIComponent(`${type.plural}.${type.group}`)}`);
    const root = crd.spec?.versions?.find((v: any) => v.name === type.version)?.schema?.openAPIV3Schema;
    if (root) return { root, document: root, source: `CRD schema · ${type.apiVersion} · ${type.kind}` };
  }
  throw openAPIError || new Error('No schema available');
}

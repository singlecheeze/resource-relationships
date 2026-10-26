import { parseDocument, stringify, visit, isScalar } from 'yaml';
import { Resource } from './model';

export function editableYaml(o: Resource): string {
  const copy = structuredClone(o);
  delete copy.status;
  delete copy.metadata.managedFields;
  return stringify(copy, { lineWidth: 0 });
}
export function parseEdit(text: string, original: Resource): Resource {
  const doc = parseDocument(text, { uniqueKeys: true });
  if (doc.errors.length) throw new Error(doc.errors.map(e => e.message).join('\n'));
  visit(doc, {
    Pair(_key, pair) {
      if (pair.value === null || (isScalar(pair.value) && pair.value.value === null && pair.value.source === '')) {
        throw new Error(`Fill the value for ${String(pair.key)}, remove that field, or explicitly enter null if intended. Empty suggestion placeholders cannot be saved.`);
      }
    },
  });
  const data = doc.toJS({ maxAliasCount: 50 }) as Resource;
  if (!data || typeof data !== 'object' || Array.isArray(data) || !data.metadata) throw new Error('Enter one Kubernetes object with metadata.');
  for (const field of ['apiVersion', 'kind'] as const) if (data[field] !== original[field]) throw new Error(`${field} cannot be changed.`);
  for (const field of ['name', 'namespace', 'uid', 'resourceVersion'] as const) {
    if (data.metadata[field] !== original.metadata[field]) throw new Error(`metadata.${field} cannot be changed. Reload the object to obtain its latest version.`);
  }
  if ('status' in data || 'managedFields' in data.metadata) throw new Error('status and metadata.managedFields are server-managed and excluded from this editor.');
  if (original.status !== undefined) data.status = original.status;
  if (original.metadata.managedFields !== undefined) data.metadata.managedFields = original.metadata.managedFields;
  return data;
}

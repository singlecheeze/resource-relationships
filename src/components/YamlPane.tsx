import * as React from 'react';
import { Alert, Button, Spinner } from '@patternfly/react-core';
import { canUpdate, errorText, getResource, updateResource } from '../lib/api';
import { editableYaml, parseEdit } from '../lib/editor';
import { LoadedResource } from '../lib/model';
import { ConsoleYamlEditor } from './ConsoleYamlEditor';
import { SchemaBundle } from '../lib/schema';
import { loadSchema } from '../lib/schema-api';
import { ResourceAbout, EditorHelp } from './ResourceEditorHelp';
import { ResourceExamples } from './ResourceExamples';

type Props = { resource: LoadedResource; onState: (uid: string, dirty: boolean, busy: boolean) => void; onClose: () => void; onSaved: (r: LoadedResource) => void };
export function YamlPane({ resource, onState, onClose, onSaved }: Props) {
  const [schema, setSchema] = React.useState<SchemaBundle>();
  const [schemaMessage, setSchemaMessage] = React.useState('Loading schema…');
  React.useEffect(() => {
    let active = true;
    loadSchema(resource.type).then(result => { if (active) { setSchema(result); setSchemaMessage(result.source); } })
      .catch(() => { if (active) setSchemaMessage('Schema unavailable or access denied. YAML editing and server validation remain available.'); });
    return () => { active = false; };
  }, [resource.type]);
  const [current, setCurrent] = React.useState<LoadedResource>();
  const [text, setText] = React.useState('');
  const [baseline, setBaseline] = React.useState('');
  const [allowed, setAllowed] = React.useState(false);
  const [busy, setBusy] = React.useState(true);
  const [message, setMessage] = React.useState('');
  const [failed, setFailed] = React.useState(false);
  const [reviewed, setReviewed] = React.useState<string | null>(null);
  const dirty = text !== baseline;
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  React.useEffect(() => { onState(resource.object.metadata.uid, dirty, busy); }, [dirty, busy, onState, resource.object.metadata.uid]);
  const load = React.useCallback(async () => {
    setBusy(true); setMessage(''); setReviewed(null);
    try {
      const fresh = await getResource(resource);
      if (!mounted.current) return;
      setCurrent(fresh);
      const yaml = editableYaml(fresh.object); setText(yaml); setBaseline(yaml);
      try {
        const access = await canUpdate(fresh);
        if (mounted.current) setAllowed(access);
      } catch (e) {
        if (mounted.current) { setAllowed(false); setFailed(true); setMessage(`Cannot verify edit permission; opened read-only. ${errorText(e)}`); }
      }
    } catch (e) { if (mounted.current) { setFailed(true); setMessage(errorText(e)); } }
    finally { if (mounted.current) setBusy(false); }
  }, [resource]);
  React.useEffect(() => { void load(); }, [load]);
  async function save(dryRun: boolean) {
    if (!current || !allowed) return;
    if (!dryRun && !window.confirm(`Save changes to ${current.object.kind} ${current.object.metadata.namespace || ''}/${current.object.metadata.name}?`)) return;
    setBusy(true); setMessage('');
    try {
      const object = parseEdit(text, current.object);
      const updated = await updateResource(current, object, dryRun);
      if (!mounted.current) return;
      setFailed(false);
      if (dryRun) { setReviewed(text); setMessage('Server validation passed. Review your YAML and choose Save changes. Nothing was saved.'); }
      else {
        const next = { ...current, object: updated };
        const yaml = editableYaml(updated);
        setCurrent(next); setText(yaml); setBaseline(yaml); setReviewed(null);
        setMessage('Changes saved.'); onSaved(next);
      }
    } catch (e) { if (mounted.current) { setFailed(true); setMessage(errorText(e)); setReviewed(null); } }
    finally { if (mounted.current) setBusy(false); }
  }
  return <aside className="resource-relationships__editor" aria-label="Resource YAML editor">
    <div className="resource-relationships__row">
      <h2>YAML · {resource.object.kind}/{resource.object.metadata.name}</h2>
      <EditorHelp />
      <Button size="sm" variant="plain" onClick={onClose} isDisabled={busy} aria-label="Close YAML editor">Close</Button>
    </div>
    <p>{resource.object.metadata.namespace || 'Cluster scoped'} · {allowed ? 'Editable' : 'Read-only'}{dirty ? ' · Unsaved changes' : ''}</p>
    <ResourceAbout resource={current || resource} schema={schema} />
    {message && <Alert isInline variant={failed ? 'danger' : 'success'} title={message} />}
    {busy && <Spinner size="md" aria-label="Loading or validating YAML" />}
    <p className="resource-relationships__muted">{schemaMessage}</p>

    <div className="resource-relationships__editor-layout">
    <div className="resource-relationships__editor-main">
    <ConsoleYamlEditor value={text} readOnly={!allowed || busy} schema={schema}
      onChange={next => { setText(next); setReviewed(null); }}
      onSave={() => { if (allowed && !busy && dirty && reviewed === text) void save(false); }} />
    <div className="resource-relationships__row">
      <Button size="sm" variant="secondary" isDisabled={!current || !allowed || busy || !dirty} onClick={() => void save(true)}>Validate on server</Button>
      <Button size="sm" variant="primary" isDisabled={!allowed || busy || !dirty || reviewed !== text} onClick={() => void save(false)}>Save changes</Button>
      <Button size="sm" variant="link" isDisabled={busy} onClick={() => { if (!dirty || window.confirm('Discard unsaved YAML and reload from the server?')) void load(); }}>Reload YAML</Button>
    </div>
    </div>
    <ResourceExamples type={resource.type} />
    </div>
  </aside>;
}

import * as React from 'react';
import { Alert, Button, Spinner, TreeView, Tabs, Tab, TabTitleText } from '@patternfly/react-core';
import type { TreeViewDataItem } from '@patternfly/react-core';
import { defaultTypes, discover, errorText, loadResources } from '../lib/api';
import { buildGraph, walkGraph, WalkNode } from '../lib/graph';
import { LoadedResource, ResourceType, typeKey } from '../lib/model';
import { YamlPane } from './YamlPane';
import { networkGroup, networkGroups, networkTypes } from '../lib/networking';
import './relationships.css';

type Menu = { uid: string; x: number; y: number };
export default function RelationshipsPage() {
  const [view, setView] = React.useState('all');
  const [infra, setInfra] = React.useState(true);
  const [types, setTypes] = React.useState<ResourceType[]>([]);
  const [enabled, setEnabled] = React.useState<string[]>([]);
  const [namespace, setNamespace] = React.useState('default');
  const [loadedScope, setLoadedScope] = React.useState('');
  const [cluster, setCluster] = React.useState(false);
  const [resources, setResources] = React.useState<LoadedResource[]>([]);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [discoveryWarnings, setDiscoveryWarnings] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [root, setRoot] = React.useState('');
  const [direction, setDirection] = React.useState<'out' | 'in'>('out');
  const [depth, setDepth] = React.useState(3);
  const [editors, setEditors] = React.useState<LoadedResource[]>([]);
  const [activeEditor, setActiveEditor] = React.useState('');
  const [editorStates, setEditorStates] = React.useState<Record<string, { dirty: boolean; busy: boolean }>>({});
  const dirty = Object.values(editorStates).some(s => s.dirty);
  const onEditorState = React.useCallback((uid: string, dirty: boolean, busy: boolean) => {
    setEditorStates(old => old[uid]?.dirty === dirty && old[uid]?.busy === busy ? old : { ...old, [uid]: { dirty, busy } });
  }, []);
  const [menu, setMenu] = React.useState<Menu>();
  const [selected, setSelected] = React.useState<TreeViewDataItem>();
  const menuRef = React.useRef<HTMLDivElement>(null);
  const controller = React.useRef<AbortController>();
  const generation = React.useRef(0);
  React.useEffect(() => {
    let active = true;
    discover().then(r => {
      if (!active) return;
      setTypes(r.types); setDiscoveryWarnings(r.warnings);
      setEnabled(r.types.filter(t => defaultTypes.has(typeKey(t))).map(typeKey));
    }).catch(e => active && setDiscoveryWarnings([errorText(e)]));
    return () => { active = false; controller.current?.abort(); generation.current++; };
  }, []);
  React.useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  React.useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector('button')?.focus();
    const close = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(undefined); };
    document.addEventListener('pointerdown', close);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('resize', close); };
  }, [menu]);
  const graph = React.useMemo(() => buildGraph(resources), [resources]);
  const open = (uid: string) => {
    setMenu(undefined);
    const resource = graph.nodes.get(uid);
    if (!resource) return;
    setEditors(old => old.some(r => r.object.metadata.uid === uid) ? old : [...old, resource]);
    setActiveEditor(uid);
  };
  const closeEditor = (uid: string) => {
    if (editorStates[uid]?.busy) return;
    const resource = editors.find(r => r.object.metadata.uid === uid);
    if (editorStates[uid]?.dirty && !window.confirm(`Discard unsaved YAML for ${resource?.object.kind}/${resource?.object.metadata.name}?`)) return;
    const index = editors.findIndex(r => r.object.metadata.uid === uid);
    const remaining = editors.filter(r => r.object.metadata.uid !== uid);
    setEditors(remaining);
    setEditorStates(old => { const next = { ...old }; delete next[uid]; return next; });
    if (activeEditor === uid) setActiveEditor(remaining[Math.min(index, remaining.length - 1)]?.object.metadata.uid || '');
  };
  const showMenu = (uid: string, x: number, y: number) => setMenu({ uid, x: Math.max(8, Math.min(x, window.innerWidth - 220)), y: Math.max(8, Math.min(y, window.innerHeight - 140)) });
  async function refresh() {
    if (!namespace.trim()) { setWarnings(['Enter a namespace. This version intentionally loads one namespace at a time.']); return; }
    setMenu(undefined);
    controller.current?.abort(); controller.current = new AbortController();
    const id = ++generation.current;
    setBusy(true); setWarnings([]);
    try {
      const result = await loadResources(types.filter(t => enabled.includes(typeKey(t)) && (t.namespaced || cluster)), namespace.trim(), controller.current.signal);
      if (id !== generation.current) return;
      if (infra && view === 'networking') {
        // Operator configuration lives outside the application project. Load only the relevant types there.
        for (const operatorNamespace of ['openshift-ingress-operator', 'openshift-sriov-network-operator']) {
          if (operatorNamespace === namespace.trim()) continue;
          const extras = await loadResources(types.filter(t => enabled.includes(typeKey(t)) && t.namespaced &&
            (operatorNamespace === 'openshift-ingress-operator' ? typeKey(t) === 'ingresscontrollers.operator.openshift.io' : t.group === 'sriovnetwork.openshift.io')), operatorNamespace, controller.current.signal);
          if (id !== generation.current) return;
          result.resources.push(...extras.resources); result.warnings.push(...extras.warnings.map(w => `${operatorNamespace}: ${w}`));
        }
      }
      setResources(result.resources); setWarnings(result.warnings); setLoadedScope(namespace.trim()); setRoot(''); setSelected(undefined);
    } catch (e) { if (id === generation.current) setWarnings([errorText(e)]); }
    finally { if (id === generation.current) setBusy(false); }
  }
  const label = (r: LoadedResource) => `${r.object.kind}: ${r.object.metadata.name}${r.object.metadata.namespace && r.object.metadata.namespace !== loadedScope ? ` (${r.object.metadata.namespace})` : ''}`;
  const renderNode = (n: WalkNode, path: string): TreeViewDataItem => {
    const r = graph.nodes.get(n.uid)!;
    const id = `${path}/${n.uid}`;
    return {
      id,
      defaultExpanded: !n.edge,
      name: <span className="resource-relationships__node" data-resource-uid={n.uid}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); showMenu(n.uid, e.clientX, e.clientY); }}
        onKeyDown={e => {
          if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
            e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); showMenu(n.uid, rect.left, rect.bottom);
          }
        }} tabIndex={0} title={n.edge?.evidence}>
        {n.edge && <span className="resource-relationships__relation">{n.reverse ? `← ${n.edge.relation} — ` : `${n.edge.relation} → `}</span>}
        {label(r)}{n.cycle ? ' ↩ already in path' : ''}
      </span>,
      action: <button className="resource-relationships__more" aria-label={`Actions for ${label(r)}`} onClick={e => {
        e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); showMenu(n.uid, rect.left, rect.bottom);
      }}>⋮</button>,
      children: n.children.length ? [...new Set(n.children.map(child => child.edge?.relation || 'Related'))].map(relation => ({
        id: `${id}/group/${relation}`, name: relation, defaultExpanded: true,
        children: n.children.filter(child => (child.edge?.relation || 'Related') === relation).map((child, i) => renderNode(child, `${id}/${relation}/${i}`)),
      })) : undefined,
    };
  };
  const matches = resources.filter(r => (view === 'all' || networkTypes.has(typeKey(r.type))) && `${label(r)} ${r.object.metadata.namespace || ''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => label(a).localeCompare(label(b)));
  const visible = matches.slice(0, 150);
  const focused = root && graph.nodes.has(root) ? graph.nodes.get(root) : undefined;
  const kindTree = (items: LoadedResource[], prefix: string): TreeViewDataItem[] => [...new Set(items.map(r => typeKey(r.type)))].map(key => ({
    id: `${prefix}/kind-${key}`, name: items.find(r => typeKey(r.type) === key)!.object.kind, defaultExpanded: true,
    children: items.filter(r => typeKey(r.type) === key).map(r => renderNode({ uid: r.object.metadata.uid, cycle: false, children: [] }, `${prefix}/${key}`)),
  }));
  const tree: TreeViewDataItem[] = focused ? [renderNode(walkGraph(graph, root, direction, depth), 'focus')]
    : view === 'all' ? kindTree(visible, 'inventory')
    : [...new Set(visible.map(r => r.type.namespaced ? `Project: ${r.object.metadata.namespace}` : 'Cluster networking'))].map(scope => ({
      id: scope, name: scope, defaultExpanded: true,
      children: Object.keys(networkGroups).flatMap(group => {
        const items = visible.filter(r => networkGroup(r) === group && (r.type.namespaced ? `Project: ${r.object.metadata.namespace}` : 'Cluster networking') === scope);
        return items.length ? [{ id: `${scope}/${group}`, name: group, defaultExpanded: true, children: kindTree(items, `${scope}/${group}`) }] : [];
      }),
    }));
  const selectedUid = selected?.id?.split('/').at(-1);
  return <main className="resource-relationships__page">
    <h1>Resource Relationships</h1>
    <p>Explore ownership and references. Right-click a resource, or use its ⋮ menu, to open YAML or follow its relationships.</p>
    <div className="resource-relationships__toolbar">
      <label>View <select aria-label="Explorer view" value={view} onChange={e => { setView(e.target.value); setRoot(''); setSelected(undefined); }}>
        <option value="all">All resources</option><option value="networking">Networking</option>
      </select></label>
      <label>Namespace <input aria-label="Namespace" value={namespace} onChange={e => setNamespace(e.target.value)} /></label>
      <label><input type="checkbox" checked={cluster} onChange={e => setCluster(e.target.checked)} /> Include selected cluster-scoped types</label>
      {view === 'networking' && <label><input type="checkbox" checked={infra} onChange={e => setInfra(e.target.checked)} /> Include ingress / SR-IOV operator namespaces</label>}
      <Button onClick={() => void refresh()} isDisabled={busy || !types.length}>Load / refresh</Button>
      {busy && <Spinner size="md" aria-label="Loading resources" />}
    </div>
    {view === 'networking' && <p className="resource-relationships__muted">Enable cluster-scoped types for nodes, NMState, GatewayClasses, egress assignments, and namespace selector evaluation. Click Load / refresh after changing scope. Network policy matches and configured references do not prove connectivity. Operator namespace defaults: openshift-ingress-operator and openshift-sriov-network-operator; enter another namespace above for custom installations.</p>}
    <details className="resource-relationships__types"><summary>Resource types ({enabled.length} selected)</summary>
      <p>Only selected types are loaded. Secrets are excluded; references to them are shown by name only.</p>
      <div className="resource-relationships__typegrid">{types.map(t => <label key={typeKey(t)}>
        <input type="checkbox" checked={enabled.includes(typeKey(t))} onChange={e => setEnabled(old => e.target.checked ? [...old, typeKey(t)] : old.filter(k => k !== typeKey(t)))} />
        {typeKey(t)}{!t.namespaced ? ' (cluster)' : ''}
      </label>)}</div>
    </details>
    {[...discoveryWarnings, ...warnings].length > 0 && <details className="resource-relationships__warnings" open>
      <summary>Partial results / API notices ({discoveryWarnings.length + warnings.length})</summary>
      <ul>{[...discoveryWarnings, ...warnings].map((w, i) => <li key={i}>{w}</li>)}</ul>
    </details>}
    <p className="resource-relationships__muted">{loadedScope ? `Snapshot: ${loadedScope} · ${resources.length} objects · ${graph.edges.length} relationships. Refresh to update.` : 'Choose a namespace and load resources.'} Relationships are limited to loaded, authorized resources.</p>
    <div className="resource-relationships__split">
      <section className="resource-relationships__tree" aria-label="Relationship explorer">
        <div className="resource-relationships__toolbar">
          <input aria-label="Search resources" placeholder="Filter by kind or name" value={search} onChange={e => setSearch(e.target.value)} disabled={Boolean(focused)} />
          {focused && <Button variant="link" onClick={() => { setRoot(''); setSelected(undefined); }}>Back to resources</Button>}
        </div>
        {focused && <div className="resource-relationships__toolbar">
          <strong>{label(focused)}</strong>
          <label>Direction <select aria-label="Relationship direction" value={direction} onChange={e => setDirection(e.target.value as 'out' | 'in')}>
            <option value="out">Outgoing (owns / uses / selects)</option><option value="in">Incoming (owned / used / selected by)</option>
          </select></label>
          <label>Depth <select aria-label="Relationship depth" value={depth} onChange={e => setDepth(Number(e.target.value))}>{[1, 2, 3, 4].map(n => <option key={n}>{n}</option>)}</select></label>
        </div>}
        {!focused && matches.length > 150 && <Alert isInline variant="info" title={`Showing 150 of ${matches.length} matching objects. Narrow your search.`} />}
        {focused && <p className="resource-relationships__muted">Expansion is bounded to {depth} levels and 200 nodes. Focus a resource to explore beyond this limit. Hover over a relationship for its source field.</p>}
        <TreeView key={`${root}/${direction}/${depth}`} aria-label="Resource relationships" data={tree} hasSelectableNodes
          activeItems={selected ? [selected] : []} onSelect={(_e, item) => setSelected(item)} />
        {!resources.length && !busy && <p>No resources loaded. Check your namespace, selected types, and API notices.</p>}
        {selectedUid && (graph.unresolved.get(selectedUid) || []).length > 0 && <div className="resource-relationships__unresolved">
          <h3>Reference and rule details</h3><ul>{graph.unresolved.get(selectedUid)!.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>}
      </section>
      {editors.length ? <aside className="resource-relationships__editors" aria-label="YAML editor workspace">
        <h2>YAML editors</h2>
        <p className="resource-relationships__muted">Each tab keeps its own edits. * indicates unsaved changes. Refreshing the tree does not reload these tabs.</p>
        <Tabs id="resource-yaml-tabs" activeKey={activeEditor} onSelect={(_e, key) => setActiveEditor(String(key))}
          onClose={(_e, key) => closeEditor(String(key))} isBox mountOnEnter={false} unmountOnExit={false}
          tabListAriaLabel="Open resource YAML editors">
          {editors.map(r => {
            const uid = r.object.metadata.uid;
            const name = `${r.object.kind}/${r.object.metadata.namespace || '(cluster)'}/${r.object.metadata.name}`;
            return <Tab key={uid} eventKey={uid} title={<TabTitleText>{name}{editorStates[uid]?.dirty ? ' *' : ''}</TabTitleText>}
              closeButtonAriaLabel={`Close ${name}`} isCloseDisabled={editorStates[uid]?.busy ?? true}>
              <YamlPane resource={r} onState={onEditorState} onClose={() => closeEditor(uid)}
                onSaved={saved => setResources(old => old.map(item => item.object.metadata.uid === saved.object.metadata.uid ? saved : item))} />
            </Tab>;
          })}
        </Tabs>
      </aside>
        : <aside className="resource-relationships__empty"><h2>Inspect and edit YAML</h2><p>Right-click a resource and choose <strong>Open YAML</strong>. Each resource opens in its own editor tab here.</p><p>Edits use your current OpenShift permissions.</p></aside>}
    </div>
    {menu && <div ref={menuRef} role="menu" aria-label="Resource actions" className="resource-relationships__menu" style={{ left: menu.x, top: menu.y }} onKeyDown={e => {
      const buttons = [...e.currentTarget.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape' || e.key === 'Tab') setMenu(undefined);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    }}>
      <button role="menuitem" onClick={() => open(menu.uid)}>Open YAML</button>
      <button role="menuitem" onClick={() => { setRoot(menu.uid); setSelected(undefined); setMenu(undefined); }}>Focus relationships</button>
    </div>}
  </main>;
}

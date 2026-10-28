const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { getByRole, getAllByRole, queryByRole, getByText, fireEvent, waitFor } = require('@testing-library/dom');

async function scenario(allowed) {
  let saves = 0, dryRuns = 0, conflict = false;
  const savedPaths = [];
  const listPaths = [];
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!e.message.includes('CSS')) errors.push(e); });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.structuredClone = structuredClone;
      w.confirm = () => true;
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.fetch = async (url, opts = {}) => {
        const u = new URL(url, 'http://localhost'), p = u.pathname.replace('/api/kubernetes', '');
        if (!opts.method && p.endsWith('/configmaps')) listPaths.push(p);
        const object = { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'settings', namespace: 'default', uid: 'config-uid', resourceVersion: '7' }, data: { greeting: 'hello' } };
        let data = {}, status = 200;
        if (p === '/openapi/v3') data = { paths: { 'api/v1': { serverRelativeURL: '/openapi/v3/api/v1' } } };
        else if (p === '/openapi/v3/api/v1') data = { components: { schemas: { ConfigMap: { 'x-kubernetes-group-version-kind': [{ group: '', version: 'v1', kind: 'ConfigMap' }], properties: { data: { type: 'object', additionalProperties: { type: 'string' } } } } } } };
        else if (p === '/apis') data = { groups: [] };
        else if (p === '/api/v1') data = { resources: ['configmaps','pods','services'].map(name => ({ name, kind: name === 'pods' ? 'Pod' : name === 'services' ? 'Service' : 'ConfigMap', namespaced: true, verbs: ['get','list','update'] })) };
        else if (p.endsWith('/services')) data = { items: [{ apiVersion: 'v1', kind: 'Service', metadata: { name: 'demo-service', namespace: 'default', uid: 'service-uid', resourceVersion: '1' }, spec: { selector: { app: 'demo' } } }] };
        else if (p.endsWith('/pods')) { data = { message: 'pods forbidden' }; status = 403; }
        else if (p.endsWith('selfsubjectaccessreviews')) data = { status: { allowed } };
        else if (opts.method === 'PUT') {
          if (u.searchParams.has('dryRun')) { dryRuns++; data = object; }
          else if (conflict) { data = { message: 'object has been modified' }; status = 409; }
          else { saves++; savedPaths.push(p); data = JSON.parse(opts.body); data.metadata.resourceVersion = '8'; }
        } else if (p.endsWith('/settings')) data = object;
        else if (p.endsWith('/other')) data = { ...object, metadata: { ...object.metadata, name: 'other', uid: 'other-uid' } };
        else if (p.endsWith('/configmaps')) data = { items: [object, { ...object, metadata: { ...object.metadata, name: 'other', uid: 'other-uid' } }], metadata: {} };
        else throw new Error('Unexpected request '+p);
        return { ok: status < 400, status, json: async () => data };
      };
    },
  });
  global.window = dom.window; global.document = dom.window.document;
  dom.window.eval(fs.readFileSync('preview-dist/preview.js','utf8'));
  const doc = dom.window.document;
  // Layout is not tested in JSDOM; omit PatternFly styles to avoid costly CSS evaluation.
  doc.querySelectorAll('style').forEach(style => style.remove());
  const wait = f => waitFor(f, { container: doc.body, timeout: 5000 });
  const button = name => getByRole(doc.body,'button',{name, exact:true});
  await wait(() => assert.equal(button('Load / refresh').disabled, false));
  fireEvent.click(button('Load / refresh'));
  await wait(() => getByText(doc.body,/pods forbidden/));
  assert.equal(getByText(doc.body,'ConfigMap',{exact:true}).closest('li').getAttribute('aria-expanded'), 'false');
  getByRole(doc.body, 'combobox', { name: 'Project' });
  assert.equal(getByRole(doc.body, 'list', { name: 'Resource types', hidden: true }).children.length, 3);
  fireEvent.click(getByText(doc.body, 'ConfigMap', { exact: true }).closest('li').querySelector('button'));
  await wait(() => getByText(doc.body,'settings',{exact:true}));
  fireEvent.contextMenu(getByText(doc.body,'settings',{exact:true}),{clientX:100,clientY:100});
  fireEvent.click(await wait(() => getByRole(doc.body,'menuitem',{name:'Open YAML'})));
  const yaml = await wait(() => {
    const el = getByRole(doc.body,'textbox',{name:'Resource YAML',exact:true});
    assert.ok(el.value.includes('greeting: hello')); return el;
  });
  assert.equal(yaml.dataset.editorFullHeight, 'false');
  assert.equal(yaml.dataset.editorHeight, 'clamp(320px, 52vh, 800px)');
  assert.ok(!queryByRole(doc.body, 'checkbox', { name: 'Compact View' }));
  fireEvent.click(button('Collapse all'));
  await wait(() => assert.equal(getByText(doc.body, 'ConfigMap', { exact: true }).closest('li').getAttribute('aria-expanded'), 'true'));
  assert.equal(getByText(doc.body, 'Service', { exact: true }).closest('li').getAttribute('aria-expanded'), 'false');
  assert.ok(getByRole(doc.body, 'textbox', { name: 'Resource YAML', exact: true }) === yaml);
  fireEvent.click(button('Expand all'));
  await wait(() => assert.equal(getByText(doc.body, 'Service', { exact: true }).closest('li').getAttribute('aria-expanded'), 'true'));
  const originalDraft = yaml.value;
  const treePane = getByRole(doc.body, 'region', { name: 'Relationship explorer' });
  assert.ok(!queryByRole(doc.body, 'heading', { name: 'Resource Relationships', exact: true }));
  const controls = getByRole(doc.body, 'region', { name: 'Explorer controls' });
  assert.ok(treePane.contains(controls));
  assert.ok(!treePane.contains(button('Hide tree')));
  assert.ok(controls.contains(button('Load / refresh')));
  assert.ok(controls.contains(getByRole(doc.body, 'textbox', { name: 'Search resources' })));
  fireEvent.click(button('Hide tree'));
  await wait(() => assert.equal(treePane.hidden, true));
  assert.ok(getByRole(doc.body, 'textbox', { name: 'Resource YAML', exact: true }) === yaml);
  assert.equal(yaml.value, originalDraft);
  fireEvent.click(button('Show tree'));
  await wait(() => assert.equal(treePane.hidden, false));
  assert.equal(getByText(doc.body, 'ConfigMap', { exact: true }).closest('li').getAttribute('aria-expanded'), 'true');
  fireEvent.click(button('Store application settings'));
  const example = await wait(() => getByRole(doc.body, 'textbox', { name: 'Example YAML: Store application settings', exact: true }));
  assert.equal(example.readOnly, true);
  assert.equal(example.dataset.editorFullHeight, 'false');
  assert.equal(example.dataset.editorHeight, '352px');
  assert.ok(example.value.includes('LOG_LEVEL: info'));
  getByRole(doc.body, 'heading', { name: 'YAML Editors', exact: true });
  assert.ok(!queryByRole(doc.body, 'button', { name: 'Close YAML editor', exact: true }));
  assert.ok(!queryByRole(doc.body, 'heading', { name: /^YAML ·/ }));
  fireEvent.click(button('Hide configuration examples'));
  await wait(() => assert.ok(!queryByRole(doc.body, 'textbox', { name: 'Example YAML: Store application settings', exact: true })));
  assert.ok(getByRole(doc.body, 'textbox', { name: 'Resource YAML', exact: true }) === yaml);
  assert.equal(yaml.value, originalDraft);
  fireEvent.click(button('Show configuration examples'));
  await wait(() => assert.ok(getByRole(doc.body, 'textbox', { name: 'Example YAML: Store application settings', exact: true }) === example));
  for (const [name, text] of [
    ['Configuration examples help', 'Expand a use case to view its YAML. Examples never change your draft or apply to the cluster.'],
    ['YAML Editors help', 'Each tab keeps its own edits. * indicates unsaved changes. Refreshing the tree does not reload these tabs.'],
  ]) {
    fireEvent.mouseEnter(button(name));
    await wait(() => getByText(getByRole(doc.body, 'tooltip'), text));
    fireEvent.mouseLeave(button(name));
    await wait(() => assert.ok(!queryByRole(doc.body, 'tooltip')));
  }

  assert.equal(yaml.value, originalDraft);
  assert.equal(saves, 0); assert.equal(dryRuns, 0);
  fireEvent.keyDown(example, { key: 's', ctrlKey: true });
  assert.equal(saves, 0);
  fireEvent.click(button('Store application settings'));
  await wait(() => assert.ok(!queryByRole(doc.body, 'textbox', { name: 'Example YAML: Store application settings', exact: true })));
  assert.equal(yaml.value, originalDraft);
  const about = button('About ConfigMap');
  assert.equal(about.getAttribute('aria-expanded'), 'false');
  fireEvent.click(about);
  await wait(() => assert.equal(about.getAttribute('aria-expanded'), 'true'));
  getByText(doc.body, /Stores non-confidential configuration/);
  const helpButton = button('YAML editor help and keyboard shortcuts');
  fireEvent.mouseEnter(helpButton);
  const shortcutTooltip = await wait(() => getByRole(doc.body, 'tooltip'));
  getByText(shortcutTooltip, 'Show available schema suggestions.');
  getByText(shortcutTooltip, 'Save after server validation; confirmation is required.');
  fireEvent.mouseLeave(helpButton);
  fireEvent.click(helpButton);
  await wait(() => getByText(doc.body, 'Keyboard shortcuts', { exact: true }));
  getByText(doc.body, /Request a save only after the exact draft/);
  fireEvent.click(button('Close YAML editor help'));
  if (allowed) {
    await wait(() => assert.equal(yaml.readOnly,false));
    fireEvent.change(yaml,{target:{value:yaml.value.replace('hello','welcome')}});
    assert.equal(button('Save changes').disabled,true);
    fireEvent.click(button('Validate on server'));
    await wait(() => assert.equal(button('Save changes').disabled,false));
    fireEvent.click(button('Save changes'));
    await wait(() => getByText(doc.body,'Changes saved.'));
    assert.equal(saves,1); assert.equal(dryRuns,1);
    conflict = true;
    fireEvent.change(yaml,{target:{value:yaml.value.replace('welcome','another')}});
    fireEvent.click(button('Validate on server'));
    await wait(() => assert.equal(button('Save changes').disabled,false));
    fireEvent.click(button('Save changes'));
    await wait(() => getByText(doc.body,/Conflict: the object changed/));
    assert.ok(yaml.value.includes('another')); assert.equal(saves,1);
    // Open a second editor without discarding the first draft.
    fireEvent.contextMenu(getByText(doc.body,'other',{exact:true, selector: '.resource-relationships__node'}),{clientX:100,clientY:100});
    fireEvent.click(await wait(() => getByRole(doc.body,'menuitem',{name:'Open YAML'})));
    const other = await wait(() => {
      const el = getByRole(doc.body,'textbox',{name:'Resource YAML',exact:true});
      assert.ok(el.value.includes('name: other')); assert.equal(el.readOnly,false); return el;
    });
    assert.equal(getAllByRole(doc.body,'tab').length,2);
    fireEvent.change(other,{target:{value:other.value.replace('hello','second-draft')}});
    await wait(() => getByRole(doc.body,'tab',{name:'ConfigMap/default/other *',exact:true}));
    fireEvent.click(getByRole(doc.body,'tab',{name:'ConfigMap/default/settings *',exact:true}));
    await wait(() => assert.ok(getByRole(doc.body,'textbox',{name:'Resource YAML',exact:true}) === yaml));
    assert.ok(yaml.value.includes('another'));
    assert.equal(button('About ConfigMap').getAttribute('aria-expanded'), 'true');
    // Reopening the same object selects it without duplicate tabs or re-fetching its draft.
    fireEvent.contextMenu(getByText(doc.body,'settings',{exact:true}),{clientX:100,clientY:100});
    fireEvent.click(await wait(() => getByRole(doc.body,'menuitem',{name:'Open YAML'})));
    await wait(() => assert.equal(getAllByRole(doc.body,'tab').length,2));
    assert.ok(yaml.value.includes('another'));
    // Graph refresh must preserve all mounted editors and drafts.
    fireEvent.click(button('Load / refresh'));
    await wait(() => assert.equal(button('Load / refresh').disabled,false));
    assert.ok(yaml.value.includes('another'));
    fireEvent.click(getByRole(doc.body,'tab',{name:'ConfigMap/default/other *',exact:true}));
    await wait(() => assert.ok(getByRole(doc.body,'textbox',{name:'Resource YAML',exact:true}) === other));
    assert.ok(other.value.includes('second-draft'));
    assert.equal(button('Save changes').disabled,true);
    conflict = false;
    fireEvent.click(button('Validate on server'));
    await wait(() => assert.equal(button('Save changes').disabled,false));
    fireEvent.click(button('Save changes'));
    await wait(() => getByRole(doc.body,'tab',{name:'ConfigMap/default/other',exact:true}));
    assert.equal(saves,2);
    assert.ok(savedPaths[1].endsWith('/other'));
    assert.ok(yaml.value.includes('another')); // Saving B never mutates A.
    // Dirty inactive tab: cancel close, then confirm close; active clean tab survives.
    dom.window.confirm = () => false;
    fireEvent.click(button('Close ConfigMap/default/settings'));
    await wait(() => assert.equal(getAllByRole(doc.body,'tab').length,2));
    dom.window.confirm = () => true;
    fireEvent.click(button('Close ConfigMap/default/settings'));
    await wait(() => assert.equal(getAllByRole(doc.body,'tab').length,1));
    assert.ok(!queryByRole(doc.body,'tab',{name:'ConfigMap/default/settings *',exact:true}));
    fireEvent.click(button('Close ConfigMap/default/other'));
    await wait(() => assert.ok(!queryByRole(doc.body,'tab')));
    getByRole(doc.body,'heading',{name:'Inspect and edit YAML'});

  } else {
    assert.equal(yaml.readOnly,true); assert.equal(button('Save changes').disabled,true);
  }
  // Networking is a separate inventory; editor drafts are unaffected by changing views.
  fireEvent.change(getByRole(doc.body, 'combobox', { name: 'Explorer view' }), { target: { value: 'networking' } });
  await wait(() => getByText(doc.body, 'Project: default', { exact: true }));
  for (const name of ['Project: default', 'Services & endpoints', 'Service']) {
    const label = await wait(() => getByText(doc.body, name, { exact: true }));
    fireEvent.click(label.closest('li').querySelector('button'));
  }
  await wait(() => getByText(doc.body, 'demo-service', { exact: true }));
  fireEvent.change(getByRole(doc.body, 'combobox', { name: 'Project' }), { target: { value: '#ALL_NS#' } });
  fireEvent.click(button('Load / refresh'));
  await wait(() => getByText(doc.body, /Snapshot: All projects/));
  assert.ok(listPaths.includes('/api/v1/configmaps'));
  assert.deepEqual(errors, []);
  dom.window.close();
}
(async () => {
  await scenario(true); console.log('PASS: context menu, validation/save/conflicts, independent tab drafts/saves, deduplication, refresh retention, dirty close cancellation and confirmation, final-tab close');
  await scenario(false); console.log('PASS: forbidden list notice and read-only YAML for denied update');
})().catch(e => { console.error(e); process.exit(1); });

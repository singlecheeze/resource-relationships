const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { getByRole, getAllByRole, queryByRole, getByText, fireEvent, waitFor } = require('@testing-library/dom');

async function scenario(allowed) {
  let saves = 0, dryRuns = 0, conflict = false;
  const savedPaths = [];
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
        const object = { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'settings', namespace: 'default', uid: 'config-uid', resourceVersion: '7' }, data: { greeting: 'hello' } };
        let data = {}, status = 200;
        if (p === '/apis') data = { groups: [] };
        else if (p === '/api/v1') data = { resources: ['configmaps','pods'].map(name => ({ name, kind: name === 'pods' ? 'Pod' : 'ConfigMap', namespaced: true, verbs: ['get','list','update'] })) };
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
  fireEvent.click(getByText(doc.body,'ConfigMap',{exact:true}));
  await wait(() => getByText(doc.body,'ConfigMap: settings',{exact:true}));
  fireEvent.contextMenu(getByText(doc.body,'ConfigMap: settings',{exact:true}),{clientX:100,clientY:100});
  fireEvent.click(await wait(() => getByRole(doc.body,'menuitem',{name:'Open YAML'})));
  const yaml = await wait(() => {
    const el = getByRole(doc.body,'textbox',{name:'Resource YAML',exact:true});
    assert.ok(el.value.includes('greeting: hello')); return el;
  });
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
    fireEvent.contextMenu(getByText(doc.body,'ConfigMap: other',{exact:true}),{clientX:100,clientY:100});
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
    // Reopening the same object selects it without duplicate tabs or re-fetching its draft.
    fireEvent.contextMenu(getByText(doc.body,'ConfigMap: settings',{exact:true}),{clientX:100,clientY:100});
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
  assert.deepEqual(errors, []);
  dom.window.close();
}
(async () => {
  await scenario(true); console.log('PASS: context menu, validation/save/conflicts, independent tab drafts/saves, deduplication, refresh retention, dirty close cancellation and confirmation, final-tab close');
  await scenario(false); console.log('PASS: forbidden list notice and read-only YAML for denied update');
})().catch(e => { console.error(e); process.exit(1); });

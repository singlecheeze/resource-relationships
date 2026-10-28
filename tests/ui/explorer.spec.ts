import { test, expect } from '@playwright/test';

test('right-click opens YAML; validation precedes save; stale edits survive conflicts', async ({ page }) => {
  let version = '7';
  let saves = 0;
  let dryRuns = 0;
  let conflict = false;
  const object = () => ({ apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'settings', namespace: 'default', uid: 'config-uid', resourceVersion: version }, data: { greeting: 'hello' } });
  await page.route('**/api/kubernetes/**', async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname.replace('/api/kubernetes', '');
    let body: any = {};
    if (p === '/apis') body = { groups: [] };
    else if (p === '/api/v1') body = { resources: [{ name: 'configmaps', kind: 'ConfigMap', namespaced: true, verbs: ['get', 'list', 'update'] }] };
    else if (p.endsWith('selfsubjectaccessreviews')) body = { status: { allowed: true } };
    else if (req.method() === 'PUT') {
      if (url.searchParams.has('dryRun')) { dryRuns++; body = object(); }
      else {
        if (conflict) return route.fulfill({ status: 409, json: { message: 'object has been modified' } });
        saves++; version = '8'; body = { ...req.postDataJSON(), metadata: { ...object().metadata } };
      }
    } else if (p.endsWith('/settings')) body = object();
    else if (p.endsWith('/configmaps')) body = { items: [object()], metadata: {} };
    else return route.fulfill({ status: 404, json: { message: 'unexpected request' } });
    await route.fulfill({ json: body });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load / refresh' }).click();
  await page.getByText('ConfigMap', { exact: true }).click();
  const item = page.getByText('settings', { exact: true });
  await item.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Open YAML' }).click();
  const yaml = page.getByRole('textbox', { name: 'Resource YAML', exact: true });
  await expect(yaml).toContainText('greeting: hello');
  await yaml.fill((await yaml.inputValue()).replace('hello', 'welcome'));
  const save = page.getByRole('button', { name: 'Save changes' });
  await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Validate on server' }).click();
  await expect(save).toBeEnabled();
  page.on('dialog', d => d.accept());
  await save.click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  expect(saves).toBe(1); expect(dryRuns).toBe(1);
  conflict = true;
  await yaml.fill((await yaml.inputValue()).replace('welcome', 'another'));
  await page.getByRole('button', { name: 'Validate on server' }).click();
  await save.click();
  await expect(page.getByText(/Conflict: the object changed/)).toBeVisible();
  expect(await yaml.inputValue()).toContain('another');
  expect(saves).toBe(1);
});

test('denied update access opens read-only, and forbidden list is reported', async ({ page }) => {
  await page.route('**/api/kubernetes/**', async route => {
    const p = new URL(route.request().url()).pathname.replace('/api/kubernetes', '');
    const object = { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'settings', namespace: 'default', uid: 'c', resourceVersion: '1' }, data: { value: 'read-only' } };
    if (p === '/apis') return route.fulfill({ json: { groups: [] } });
    if (p === '/api/v1') return route.fulfill({ json: { resources: ['configmaps', 'pods'].map(name => ({ name, kind: name === 'pods' ? 'Pod' : 'ConfigMap', namespaced: true, verbs: ['get', 'list', 'update'] })) } });
    if (p.endsWith('/pods')) return route.fulfill({ status: 403, json: { message: 'pods forbidden' } });
    if (p.endsWith('selfsubjectaccessreviews')) return route.fulfill({ json: { status: { allowed: false } } });
    return route.fulfill({ json: p.endsWith('/settings') ? object : { items: [object], metadata: {} } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load / refresh' }).click();
  await expect(page.getByText(/pods forbidden/)).toBeVisible();
  await page.getByText('ConfigMap', { exact: true }).click();
  await page.getByRole('button', { name: 'Actions for ConfigMap: settings' }).click();
  await page.getByRole('menuitem', { name: 'Open YAML' }).click();
  await expect(page.getByRole('textbox', { name: 'Resource YAML', exact: true })).toHaveAttribute('readonly', '');
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
});

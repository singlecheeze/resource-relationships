import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bulkTreeExpansion, ResourceTreeItem } from '../src/lib/tree-expansion';

const tree: ResourceTreeItem[] = [
  { id: 'scope', name: 'Scope', children: [
    { id: 'kind', name: 'Kind', children: [
      { id: 'a', name: 'A', resourceUid: 'open-a', children: [{ id: 'child', name: 'child', children: [{ name: 'leaf' }] }] },
      { id: 'b', name: 'B', resourceUid: 'closed', children: [{ name: 'leaf' }] },
    ] },
  ] },
  { id: 'other-path', name: 'Other path', children: [{ name: 'A again', resourceUid: 'open-a' }, { name: 'Inactive tab', resourceUid: 'open-b' }] },
];
test('collapse preserves open resources and every ancestor/occurrence, but closes unrelated descendants', () => {
  const result = bulkTreeExpansion(tree, 'open', new Set(['open-a', 'open-b']));
  assert.equal(result[0].defaultExpanded, true);
  assert.equal(result[0].children![0].defaultExpanded, true);
  const [a, b] = result[0].children![0].children!;
  assert.equal(a.defaultExpanded, true);
  assert.equal(a.children![0].defaultExpanded, false);
  assert.equal(b.defaultExpanded, false);
  assert.equal(result[1].defaultExpanded, true);
  assert.ok(result[1].children!.every(item => item.defaultExpanded));
  assert.equal(tree[0].defaultExpanded, undefined);
});
test('expand covers the full supplied tree; collapse with no visible open tabs closes everything', () => {
  const check = (items: ResourceTreeItem[], expected: boolean) => items.forEach(item => {
    assert.equal(item.defaultExpanded, expected);
    if (item.children) check(item.children, expected);
  });
  check(bulkTreeExpansion(tree, 'all', new Set()), true);
  check(bulkTreeExpansion(tree, 'open', new Set(['not-in-this-view'])), false);
});

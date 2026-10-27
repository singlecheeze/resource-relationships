import type { TreeViewDataItem } from '@patternfly/react-core';

export type ResourceTreeItem = TreeViewDataItem & { resourceUid?: string; children?: ResourceTreeItem[] };

/** Keep every occurrence and ancestor of an open resource visible, including inactive tabs. */
export function bulkTreeExpansion(items: ResourceTreeItem[], mode: 'all' | 'open', openUids: Set<string>): ResourceTreeItem[] {
  const visit = (item: ResourceTreeItem): { item: ResourceTreeItem; protectedPath: boolean } => {
    const children = item.children?.map(visit);
    const protectedPath = Boolean(item.resourceUid && openUids.has(item.resourceUid)) || Boolean(children?.some(child => child.protectedPath));
    return { protectedPath, item: { ...item, defaultExpanded: mode === 'all' || protectedPath, children: children?.map(child => child.item) } };
  };
  return items.map(item => visit(item).item);
}

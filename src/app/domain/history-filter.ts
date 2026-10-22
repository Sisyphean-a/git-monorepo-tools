import type { HistoryScope, RepoRef } from './types.js';

export const HISTORY_MAX_COMMITS = 1000;

const REF_GROUPS: { kind: RepoRef['kind']; label: string }[] = [
  { kind: 'branch', label: '本地分支' },
  { kind: 'remote', label: '远端分支' },
  { kind: 'tag', label: '标签' },
];

export function groupRepoRefs(refs: RepoRef[]) {
  return REF_GROUPS.map(group => ({
    kind: group.kind,
    label: group.label,
    refs: refs
      .filter(ref => ref.kind === group.kind)
      .sort((left, right) =>
        Number(Boolean(right.current)) - Number(Boolean(left.current))
        || left.shortName.localeCompare(right.shortName)),
  })).filter(group => group.refs.length > 0);
}

export function historyScopeLabel(scope: HistoryScope, selectedRefs: string[], refs: RepoRef[]) {
  if (scope === 'all') return '全部分支';
  if (scope === 'head') return '当前分支';
  if (selectedRefs.length === 1) {
    const name = selectedRefs[0];
    return (name && refs.find(ref => ref.name === name)?.shortName) || name || '选择分支';
  }
  return `已选 ${selectedRefs.length} 个分支`;
}

export function pruneHistoryRefs(refs: RepoRef[], selectedRefs: string[]) {
  const available = new Set(refs.map(ref => ref.name));
  return selectedRefs.filter(name => available.has(name));
}

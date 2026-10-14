import { mergeRepoSnapshotUpdate, mergeSnapshotPreservingInteractions, type SnapshotApplyContext } from '../domain/repo-snapshot-merge.js';
import type { AppSnapshot, RepoSnapshotUpdate } from '../domain/types.js';

// Rule: 快照回写版本只归此状态所有；协调器的任务版本仍独立用于丢弃旧任务。
export function createWorkspaceSnapshotState() {
  let snapshot: AppSnapshot | null = null;
  let interactionRevision = 0;
  const interactionVersions = new Map<string, number>();

  return {
    readSnapshot: () => snapshot,
    readRepoUpdateRevision: () => interactionRevision,
    applySnapshot(next: AppSnapshot, context?: SnapshotApplyContext) {
      snapshot = context
        ? mergeSnapshotPreservingInteractions(next, snapshot, interactionVersions, context.preserveInteractionsSince)
        : next;
      return snapshot;
    },
    applyInteraction(update: RepoSnapshotUpdate) {
      interactionRevision += 1;
      interactionVersions.set(update.repo.id, interactionRevision);
      if (snapshot) snapshot = mergeRepoSnapshotUpdate(snapshot, update, 'interaction', `interaction-${interactionRevision}`);
      return snapshot;
    },
    applyBackground(update: RepoSnapshotUpdate, context?: SnapshotApplyContext) {
      if (!snapshot?.repoDetails[update.repo.id]) return;
      // Rule: 迟到的结果不能覆盖新交互，也不能恢复完整快照已移除的仓库。
      if (context && (interactionVersions.get(update.repo.id) ?? 0) > context.preserveInteractionsSince) return;
      snapshot = mergeRepoSnapshotUpdate(snapshot, update, 'background');
      return snapshot;
    },
  };
}

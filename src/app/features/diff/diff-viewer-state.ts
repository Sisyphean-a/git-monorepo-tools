import type { FileChange } from '../../domain/types.js';

export type WorkingDiffMode = 'staged' | 'unstaged';

export function filterWorkingDiffFiles(files: FileChange[], mode: WorkingDiffMode) {
  return files.filter(file => !file.untracked && (mode === 'staged' ? file.staged : !file.staged));
}

export function chooseDefaultWorkingDiffMode(files: FileChange[]): WorkingDiffMode {
  let hasStaged = false;
  let hasUnstaged = false;
  for (const file of files) {
    if (file.untracked) continue;
    if (file.staged) hasStaged = true;
    else hasUnstaged = true;
  }
  return hasStaged && !hasUnstaged ? 'staged' : 'unstaged';
}

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

function main() {
  const scanTime = new Date();
  const selectedRepoPath = normalizePath(process.cwd());
  const repoEntries = discoverRepos(buildRoots(selectedRepoPath));
  const snapshots = repoEntries.map(entry => buildRepoSnapshot(entry, scanTime));
  const ordered = sortSnapshots(snapshots, selectedRepoPath);
  const selected = ordered.find(item => item.path === selectedRepoPath) ?? ordered[0];
  const categories = [...new Set(ordered.map(item => item.category))];
  const repoMap = Object.fromEntries(ordered.map(item => [item.id, item.detail]));
  const pullResults = ordered.map(item => item.pullResult);
  const diffLines = buildPreviewLines(selected);
  const candidateMap = Object.fromEntries(ordered.map(item => [item.id, item.commitCandidates]));
  const source = createModule({
    categories,
    repos: ordered.map(item => item.detail),
    repoDetails: repoMap,
    pullResults,
    diffLines,
    selectedRepoId: selected?.id ?? '',
    commitCandidates: candidateMap,
    scannedAt: formatDateTime(scanTime),
  });
  const targetPath = path.join(process.cwd(), 'src', 'app', 'data.ts');
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, source, 'utf8');
  console.log(`wrote ${normalizePath(targetPath)}`);
}

function buildRoots(selectedRepoPath) {
  const workspaceRoot = normalizePath(path.dirname(selectedRepoPath));
  const driveRoot = normalizePath(path.parse(selectedRepoPath).root);
  const roots = [
    { path: workspaceRoot, category: classifyWorkspaceRoot(workspaceRoot), scanChildren: true },
    { path: driveRoot, category: '本地项目', scanChildren: true },
  ];
  const extraRoots = (process.env.GIT_MANAGER_SCAN_ROOTS ?? '')
    .split(';')
    .map(item => normalizePath(item.trim()))
    .filter(Boolean);
  for (const rootPath of extraRoots) {
    roots.push({ path: rootPath, category: classifyCustomRoot(rootPath), scanChildren: true });
  }
  return dedupeRoots(roots);
}

function classifyWorkspaceRoot(rootPath) {
  const name = path.basename(rootPath).toLowerCase();
  if (name === 'github') return 'GitHub 工作区';
  return `${path.basename(rootPath) || '工作区'} 工作区`;
}

function classifyCustomRoot(rootPath) {
  return `${path.basename(rootPath) || '自定义'} 工作区`;
}

function dedupeRoots(roots) {
  const seen = new Set();
  return roots.filter(root => {
    const key = normalizePath(root.path).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function discoverRepos(roots) {
  const repos = new Map();
  for (const root of roots) {
    if (!fs.existsSync(root.path)) continue;
    for (const repoPath of collectRepoPaths(root.path, root.scanChildren)) {
      const normalized = normalizePath(repoPath);
      if (!repos.has(normalized.toLowerCase())) {
        repos.set(normalized.toLowerCase(), { repoPath: normalized, category: root.category });
      }
    }
  }
  return [...repos.values()];
}

function collectRepoPaths(rootPath, scanChildren) {
  const repos = [];
  if (isGitRepo(rootPath)) repos.push(rootPath);
  if (!scanChildren) return repos;
  const children = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const child of children) {
    if (!child.isDirectory()) continue;
    const repoPath = path.join(rootPath, child.name);
    if (isGitRepo(repoPath)) repos.push(repoPath);
  }
  return repos;
}

function isGitRepo(repoPath) {
  return fs.existsSync(path.join(repoPath, '.git'));
}

function buildRepoSnapshot(entry, scanTime) {
  const repoPath = normalizePath(entry.repoPath);
  const repoName = path.basename(repoPath);
  const repoId = createRepoId(repoName, repoPath);
  const statusOutput = runGit(repoPath, ['status', '--porcelain=v1', '-b']);
  const parsed = parseStatus(statusOutput);
  const files = buildFileChanges(repoPath, parsed.entries);
  const uniqueChanges = new Set(files.map(file => file.path)).size;
  const history = buildHistory(repoPath);
  const repo = {
    id: repoId,
    name: repoName,
    branch: parsed.branch,
    path: repoPath,
    remote: parsed.remote,
    category: entry.category,
    modified: uniqueChanges,
    ahead: parsed.ahead,
    behind: parsed.behind,
    conflicts: parsed.conflicts,
    status: parsed.conflicts > 0 ? 'conflict' : uniqueChanges > 0 ? 'changed' : 'clean',
    lastScan: formatTime(scanTime),
  };
  const detail = {
    ...repo,
    files,
    stagedCount: files.filter(file => file.staged).length,
    unstagedCount: files.filter(file => !file.staged).length,
    scannedAt: formatDateTime(scanTime),
    history,
  };
  return {
    ...repo,
    repo,
    detail,
    commitCandidates: buildCommitCandidates(files),
    pullResult: buildPullResult(repoId, repoName, repoPath, repo),
  };
}

function parseStatus(output) {
  const lines = output.split(/\r?\n/).filter(Boolean);
  const branchLine = lines[0] ?? '## HEAD';
  const entries = lines.slice(1);
  const branch = extractBranch(branchLine);
  const remote = extractRemote(branchLine);
  const ahead = extractCount(branchLine, 'ahead');
  const behind = extractCount(branchLine, 'behind');
  const conflicts = entries.filter(line => isConflictLine(line.slice(0, 2))).length;
  return { branch, remote, ahead, behind, conflicts, entries };
}

function extractBranch(line) {
  const match = line.match(/^## ([^.\s]+)/);
  return match?.[1] ?? 'HEAD';
}

function extractRemote(line) {
  const match = line.match(/\.\.\.([^ \[]+)/);
  if (!match) return '—';
  return match[1].split('/')[0] ?? match[1];
}

function extractCount(line, key) {
  const match = line.match(new RegExp(`${key} (\\d+)`));
  return match ? Number(match[1]) : 0;
}

function isConflictLine(code) {
  return ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(code);
}

function buildFileChanges(repoPath, entries) {
  const stagedStats = parseNumstat(runGit(repoPath, ['diff', '--cached', '--numstat', '--no-renames']));
  const unstagedStats = parseNumstat(runGit(repoPath, ['diff', '--numstat', '--no-renames']));
  const fileChanges = [];
  for (const [filePath, stat] of stagedStats) {
    fileChanges.push(createChange(repoPath, filePath, stat, true));
  }
  for (const [filePath, stat] of unstagedStats) {
    fileChanges.push(createChange(repoPath, filePath, stat, false));
  }
  const trackedPaths = new Set(fileChanges.map(item => `${item.path}::${item.staged ? 'staged' : 'unstaged'}`));
  for (const line of entries) {
    if (!line.startsWith('?? ')) continue;
    for (const filePath of expandUntracked(repoPath, line.slice(3).trim())) {
      const key = `${filePath}::unstaged`;
      if (trackedPaths.has(key)) continue;
      fileChanges.push(createUntrackedChange(repoPath, filePath));
      trackedPaths.add(key);
    }
  }
  return fileChanges.sort(compareChanges);
}

function parseNumstat(output) {
  const stats = new Map();
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [added, deleted, rawPath] = line.split('\t');
    const filePath = normalizePath(rawPath);
    stats.set(filePath, {
      additions: toNumber(added),
      deletions: toNumber(deleted),
      status: detectStatus(filePath, added, deleted),
    });
  }
  return stats;
}

function detectStatus(filePath, added, deleted) {
  if (added === '0') return 'D';
  if (deleted === '0') return 'A';
  if (filePath.includes(' -> ')) return 'R';
  return 'M';
}

function createChange(repoPath, filePath, stat, staged) {
  return {
    id: `${filePath}::${staged ? 'staged' : 'unstaged'}`,
    status: stat.status,
    path: filePath,
    additions: stat.additions,
    deletions: stat.deletions,
    size: formatSize(resolveSize(path.join(repoPath, filePath))),
    staged,
  };
}

function createUntrackedChange(repoPath, filePath) {
  const absolutePath = path.join(repoPath, filePath);
  return {
    id: `${filePath}::unstaged`,
    status: 'A',
    path: filePath,
    additions: countFileLines(absolutePath),
    deletions: 0,
    size: formatSize(resolveSize(absolutePath)),
    staged: false,
  };
}

function expandUntracked(repoPath, rawPath) {
  const absolutePath = path.join(repoPath, rawPath);
  if (!fs.existsSync(absolutePath)) return [normalizePath(rawPath)];
  const stat = fs.statSync(absolutePath);
  if (!stat.isDirectory()) return [normalizePath(rawPath)];
  return listFiles(absolutePath).map(filePath => normalizePath(path.relative(repoPath, filePath)));
}

function listFiles(rootPath) {
  const files = [];
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(absolutePath));
      continue;
    }
    files.push(absolutePath);
  }
  return files;
}

function buildHistory(repoPath) {
  const output = runGit(repoPath, ['log', '-5', '--pretty=format:%H%x1f%h%x1f%an%x1f%ar%x1f%s']);
  if (!output.trim()) return [];
  return output.split(/\r?\n/).filter(Boolean).map(line => {
    const [hash, shortHash, author, time, message] = line.split('\u001f');
    const { additions, deletions } = buildCommitStats(repoPath, hash);
    return {
      hash,
      shortHash,
      author,
      time,
      message,
      additions,
      deletions,
    };
  });
}

function buildCommitStats(repoPath, hash) {
  const output = runGit(repoPath, ['show', '--shortstat', '--format=', hash]);
  const line = output.split(/\r?\n/).find(item => item.includes('file changed') || item.includes('files changed')) ?? '';
  return {
    additions: extractShortstatValue(line, /(\d+)\sinsertions?\(\+\)/),
    deletions: extractShortstatValue(line, /(\d+)\sdeletions?\(-\)/),
  };
}

function extractShortstatValue(line, pattern) {
  const match = line.match(pattern);
  return match ? Number(match[1]) : 0;
}

function buildCommitCandidates(files) {
  const stagedFiles = files.filter(file => file.staged);
  if (stagedFiles.length === 0) return [];
  const scopes = topScopes(stagedFiles);
  const summary = scopes.join(', ');
  const totalFiles = stagedFiles.length;
  return [
    {
      id: 'emoji',
      style: 'Emoji',
      icon: '✨',
      title: `feat(${scopes[0]}): 更新 ${summary}`,
      body: `基于 ${totalFiles} 个暂存文件生成`,
      full: `✨ feat(${scopes[0]}): 更新 ${summary}\n\n- 涉及 ${totalFiles} 个暂存文件\n- 主要目录：${summary}`,
    },
    {
      id: 'short',
      style: 'Standard Short',
      icon: '📝',
      title: `${scopes[0]}: 更新 ${totalFiles} 个暂存文件`,
      body: `基于 ${totalFiles} 个暂存文件生成`,
      full: `${scopes[0]}: 更新 ${totalFiles} 个暂存文件\n\n主要变更目录：${summary}`,
    },
    {
      id: 'conventional',
      style: 'Conventional Commit',
      icon: '📐',
      title: `chore(${scopes[0]}): refresh staged workspace changes`,
      body: `基于 ${totalFiles} 个暂存文件生成`,
      full: `chore(${scopes[0]}): refresh staged workspace changes\n\nstaged files: ${totalFiles}\nscopes: ${summary}`,
    },
  ];
}

function topScopes(files) {
  const counter = new Map();
  for (const file of files) {
    const scope = file.path.split('/')[0] || 'repo';
    counter.set(scope, (counter.get(scope) ?? 0) + 1);
  }
  return [...counter.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(item => item[0]);
}

function buildPullResult(repoId, repoName, repoPath, repo) {
  if (repo.conflicts > 0) {
    return { id: repoId, name: repoName, path: repoPath, result: 'failed', detail: '检测到冲突，需先人工处理' };
  }
  if (repo.modified > 0) {
    return { id: repoId, name: repoName, path: repoPath, result: 'skipped', detail: '跳过：存在本地未提交改动' };
  }
  if (repo.behind > 0) {
    return {
      id: repoId,
      name: repoName,
      path: repoPath,
      result: 'skipped',
      detail: `可执行 pull --ff-only：落后远端 ${repo.behind} 个提交`,
      commits: repo.behind,
    };
  }
  if (repo.ahead > 0) {
    return {
      id: repoId,
      name: repoName,
      path: repoPath,
      result: 'uptodate',
      detail: `本地领先远端 ${repo.ahead} 个提交`,
      commits: repo.ahead,
    };
  }
  return { id: repoId, name: repoName, path: repoPath, result: 'uptodate', detail: '工作区干净，已与远端同步' };
}

function buildPreviewLines(selected) {
  const firstFile = selected?.detail.files[0];
  if (!firstFile) return [];
  const repoPath = selected.path;
  const relativePath = firstFile.path;
  if (firstFile.status === 'A' && !firstFile.staged) {
    const fullPath = path.join(repoPath, relativePath);
    const lines = safeReadLines(fullPath).slice(0, 80);
    return [{ type: 'hunk', content: `@@ -0,0 +1,${lines.length} @@` }, ...lines.map(line => ({ type: 'added', content: `+${line}` }))];
  }
  const args = firstFile.staged
    ? ['diff', '--cached', '--no-color', '--', relativePath]
    : ['diff', '--no-color', '--', relativePath];
  const diff = runGit(repoPath, args);
  return diff
    .split(/\r?\n/)
    .filter(line => line && !line.startsWith('diff --git') && !line.startsWith('index ') && !line.startsWith('--- ') && !line.startsWith('+++ '))
    .slice(0, 120)
    .map(line => toDiffLine(line));
}

function toDiffLine(line) {
  if (line.startsWith('@@')) return { type: 'hunk', content: line };
  if (line.startsWith('+')) return { type: 'added', content: line };
  if (line.startsWith('-')) return { type: 'deleted', content: line };
  return { type: 'context', content: line };
}

function compareChanges(left, right) {
  if (left.staged !== right.staged) return left.staged ? -1 : 1;
  return left.path.localeCompare(right.path);
}

function sortSnapshots(items, selectedRepoPath) {
  return [...items].sort((left, right) => {
    if (left.path === selectedRepoPath) return -1;
    if (right.path === selectedRepoPath) return 1;
    if (left.modified !== right.modified) return right.modified - left.modified;
    return left.name.localeCompare(right.name);
  });
}

function resolveSize(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const stat = fs.statSync(filePath);
  return stat.isFile() ? stat.size : 0;
}

function countFileLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.length === 0) return 0;
  return content.split(/\r?\n/).length;
}

function safeReadLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  } catch {
    return ['[binary file]'];
  }
}

function runGit(repoPath, args) {
  const result = spawnSync('git', ['-C', repoPath, ...args], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) return '';
  return result.stdout.trim();
}

function createModule(data) {
  return `import type { CommitCandidate, DiffLine, PullResult, Repo, RepoDetail } from './types';

/* auto-generated by npm run sync:data */
export const SCANNED_AT = ${JSON.stringify(data.scannedAt)};
export const CATEGORIES: string[] = ${JSON.stringify(data.categories, null, 2)};
export const REPOS: Repo[] = ${JSON.stringify(data.repos, null, 2)};
export const REPO_DETAILS: Record<string, RepoDetail> = ${JSON.stringify(data.repoDetails, null, 2)};
export const SELECTED_REPO_ID = ${JSON.stringify(data.selectedRepoId)};
export const FILE_CHANGES = REPO_DETAILS[SELECTED_REPO_ID]?.files ?? [];
export const PULL_RESULTS: PullResult[] = ${JSON.stringify(data.pullResults, null, 2)};
export const DIFF_LINES: DiffLine[] = ${JSON.stringify(data.diffLines, null, 2)};
export const COMMIT_CANDIDATES: Record<string, CommitCandidate[]> = ${JSON.stringify(data.commitCandidates, null, 2)};
`;
}

function createRepoId(repoName, repoPath) {
  const prefix = repoName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'repo';
  const suffix = createHash('sha1').update(repoPath).digest('hex').slice(0, 6);
  return `${prefix}-${suffix}`;
}

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

function toNumber(value) {
  return /^\d+$/.test(value) ? Number(value) : 0;
}

function formatSize(size) {
  if (size <= 0) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(date) {
  return date.toLocaleTimeString('zh-CN', { hour12: false });
}

function formatDateTime(date) {
  return date.toLocaleString('zh-CN', { hour12: false });
}

main();

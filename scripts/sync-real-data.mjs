import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildAiContext, ensureAiSettings, parseAiCandidates, requestAiCompletion } from './ai-commit.mjs';

const DEFAULT_PULL_STRATEGY = 'ff-only';
const DEFAULT_PUSH_STRATEGY = 'upstream-only';
const PROJECT_ROOT = normalizePath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));

function main() {
  const snapshot = buildAppSnapshot();
  const targetPath = writeDataModule(snapshot);
  console.log(`已写入 ${normalizePath(targetPath)}`);
}

export function buildAppSnapshot(selectedRepoPath = PROJECT_ROOT, pullResultsOverride, scanRoots = [], refreshRemotes = false) {
  const scanTime = new Date();
  const repoEntries = discoverRepos(buildRoots(scanRoots));
  const snapshots = repoEntries.map(entry => buildRepoSnapshot(entry, scanTime, refreshRemotes));
  const ordered = sortSnapshots(snapshots, selectedRepoPath);
  const selected = ordered.find(item => item.path === selectedRepoPath) ?? ordered[0];
  return {
    scannedAt: formatDateTime(scanTime),
    categories: [...new Set(ordered.map(item => item.category))],
    repos: ordered.map(item => item.detail),
    repoDetails: Object.fromEntries(ordered.map(item => [item.id, item.detail])),
    selectedRepoId: selected?.id ?? '',
    pullResults: pullResultsOverride ?? ordered.map(item => item.pullResult),
    commitCandidates: Object.fromEntries(ordered.map(item => [item.id, item.commitCandidates])),
  };
}

export function writeDataModule(snapshot, targetPath = path.join(PROJECT_ROOT, 'src', 'app', 'data.ts')) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, createModule(snapshot), 'utf8');
  return targetPath;
}

function buildRoots(scanRoots = []) {
  const roots = [];
  const extraRoots = (process.env.GIT_MANAGER_SCAN_ROOTS ?? '')
    .split(';')
    .map(item => normalizePath(item.trim()))
    .filter(Boolean);
  for (const rootPath of extraRoots) {
    roots.push({ path: rootPath, category: classifyCustomRoot(rootPath), scanChildren: true });
  }
  for (const root of scanRoots) {
    if (!root?.path) continue;
    roots.push({
      path: normalizePath(root.path),
      category: root.category?.trim() || classifyCustomRoot(root.path),
      scanChildren: true,
    });
  }
  return dedupeRoots(roots);
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

function buildRepoSnapshot(entry, scanTime, refreshRemotes = false) {
  const repoPath = normalizePath(entry.repoPath);
  const repoName = path.basename(repoPath);
  const repoId = createRepoId(repoName, repoPath);
  const parsed = loadRepoStatus(repoPath, refreshRemotes);
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

function readStatus(repoPath) {
  return parseStatus(runGit(repoPath, ['status', '--porcelain=v1', '-b']));
}

function loadRepoStatus(repoPath, refreshRemotes) {
  return refreshRemotes ? readStatusAfterRemoteSync(repoPath) : readStatus(repoPath);
}

function readStatusAfterRemoteSync(repoPath) {
  const parsed = readStatus(repoPath);
  if (parsed.remote === '—') return parsed;
  runGitStrict(repoPath, ['fetch', '--prune', '--quiet', parsed.remote]);
  return readStatus(repoPath);
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
      style: '表情风格',
      icon: '✨',
      title: `feat(${scopes[0]}): 更新 ${summary}`,
      body: `基于 ${totalFiles} 个暂存文件生成`,
      full: `✨ feat(${scopes[0]}): 更新 ${summary}\n\n- 涉及 ${totalFiles} 个暂存文件\n- 主要目录：${summary}`,
    },
    {
      id: 'short',
      style: '标准短句',
      icon: '📝',
      title: `${scopes[0]}: 更新 ${totalFiles} 个暂存文件`,
      body: `基于 ${totalFiles} 个暂存文件生成`,
      full: `${scopes[0]}: 更新 ${totalFiles} 个暂存文件\n\n主要变更目录：${summary}`,
    },
    {
      id: 'conventional',
      style: '约定式提交',
      icon: '📐',
      title: `chore(${scopes[0]}): 更新暂存区改动`,
      body: `基于 ${totalFiles} 个暂存文件生成`,
      full: `chore(${scopes[0]}): 更新暂存区改动\n\n暂存文件：${totalFiles}\n主要范围：${summary}`,
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

function resolveRepoContext(repoId, scanRoots = []) {
  const selectedRepoPath = PROJECT_ROOT;
  const repoEntries = discoverRepos(buildRoots(selectedRepoPath, scanRoots));
  const scanTime = new Date();
  for (const entry of repoEntries) {
    const repoPath = normalizePath(entry.repoPath);
    if (createRepoId(path.basename(repoPath), repoPath) !== repoId) continue;
    const snapshot = buildRepoSnapshot(entry, scanTime);
    if (snapshot.id === repoId) return snapshot;
  }
  throw new Error(`未找到仓库：${repoId}`);
}

function ensureCleanForPull(repo) {
  if (repo.conflicts > 0) throw new Error('当前仓库存在冲突，不能执行 pull');
  if (repo.detail.files.length > 0) throw new Error('当前仓库有本地改动，请先提交或处理后再拉取');
}

function ensureCommitInput(message) {
  if (!message.trim()) throw new Error('提交信息不能为空');
}

function parseFilePath(fileId, filePath) {
  if (filePath) return filePath;
  if (!fileId) throw new Error('缺少文件标识');
  return fileId.split('::')[0];
}

function runGitStrict(repoPath, args) {
  const result = spawnSync('git', ['-C', repoPath, ...args], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || '').trim();
    throw new Error(message || `git ${args.join(' ')} 失败`);
  }
  return result.stdout.trim();
}

export function stageAllRepo(repoId, scanRoots) {
  const repo = resolveRepoContext(repoId, scanRoots);
  runGitStrict(repo.path, ['add', '-A']);
  return buildAppSnapshot(undefined, undefined, scanRoots);
}

export function unstageAllRepo(repoId, scanRoots) {
  const repo = resolveRepoContext(repoId, scanRoots);
  runGitStrict(repo.path, ['restore', '--staged', '.']);
  return buildAppSnapshot(undefined, undefined, scanRoots);
}

export function stageRepoFile(repoId, fileId, filePath, scanRoots) {
  const repo = resolveRepoContext(repoId, scanRoots);
  runGitStrict(repo.path, ['add', '--', parseFilePath(fileId, filePath)]);
  return buildAppSnapshot(undefined, undefined, scanRoots);
}

export function unstageRepoFile(repoId, fileId, filePath, scanRoots) {
  const repo = resolveRepoContext(repoId, scanRoots);
  runGitStrict(repo.path, ['restore', '--staged', '--', parseFilePath(fileId, filePath)]);
  return buildAppSnapshot(undefined, undefined, scanRoots);
}

export function commitRepo(repoId, message, scanRoots) {
  ensureCommitInput(message);
  const repo = resolveRepoContext(repoId, scanRoots);
  runGitStrict(repo.path, ['commit', '-m', message]);
  return buildAppSnapshot(undefined, undefined, scanRoots);
}

export function pullRepo(repoId, scanRoots, pullStrategy = DEFAULT_PULL_STRATEGY) {
  const repo = resolveRepoContext(repoId, scanRoots);
  ensureCleanForPull(repo);
  runGitStrict(repo.path, pullArgs(pullStrategy));
  return buildAppSnapshot(undefined, undefined, scanRoots);
}

export function pushRepo(repoId, scanRoots) {
  const repo = resolveRepoContext(repoId, scanRoots);
  if (repo.remote === '—') throw new Error('当前分支没有 upstream，暂不支持自动 push');
  runGitStrict(repo.path, ['push']);
  return buildAppSnapshot(undefined, undefined, scanRoots);
}

function executePullAll(repo, pullStrategy = DEFAULT_PULL_STRATEGY) {
  if (repo.remote === '—') {
    return { id: repo.id, name: repo.name, path: repo.path, result: 'skipped', detail: '跳过：当前分支没有 upstream' };
  }
  if (repo.ahead > 0 && repo.behind > 0) {
    return { id: repo.id, name: repo.name, path: repo.path, result: 'skipped', detail: '跳过：当前分支与远端已分叉' };
  }
  if (repo.conflicts > 0) {
    return { id: repo.id, name: repo.name, path: repo.path, result: 'failed', detail: '检测到冲突，需先人工处理' };
  }
  if (repo.detail.files.length > 0) {
    return { id: repo.id, name: repo.name, path: repo.path, result: 'skipped', detail: '跳过：存在本地未提交改动' };
  }
  if (repo.behind === 0) {
    return { id: repo.id, name: repo.name, path: repo.path, result: 'uptodate', detail: '工作区干净，已与远端同步' };
  }
  try {
    runGitStrict(repo.path, pullArgs(pullStrategy));
    return { id: repo.id, name: repo.name, path: repo.path, result: 'pulled', detail: `已拉取 ${repo.behind} 个提交`, commits: repo.behind };
  } catch (error) {
    return { id: repo.id, name: repo.name, path: repo.path, result: 'failed', detail: error.message };
  }
}

function executePushAll(repo, pushStrategy = DEFAULT_PUSH_STRATEGY) {
  if (repo.remote === '—') {
    return { id: repo.id, name: repo.name, path: repo.path, result: 'skipped', detail: '跳过：当前分支没有 upstream' };
  }
  if (pushStrategy === 'upstream-only' && repo.ahead === 0) {
    return { id: repo.id, name: repo.name, path: repo.path, result: 'uptodate', detail: '没有需要推送的提交' };
  }
  if (repo.ahead === 0) {
    return { id: repo.id, name: repo.name, path: repo.path, result: 'uptodate', detail: '没有需要推送的提交' };
  }
  try {
    runGitStrict(repo.path, ['push']);
    return { id: repo.id, name: repo.name, path: repo.path, result: 'pushed', detail: `已推送 ${repo.ahead} 个提交`, commits: repo.ahead };
  } catch (error) {
    return { id: repo.id, name: repo.name, path: repo.path, result: 'failed', detail: error.message };
  }
}

export function pullAllRepos(scanRoots, pullStrategy = DEFAULT_PULL_STRATEGY) {
  const snapshot = buildAppSnapshot(undefined, undefined, scanRoots);
  const results = snapshot.repos.map(repo => executePullAll({ ...repo, detail: snapshot.repoDetails[repo.id] }, pullStrategy));
  return { results, snapshot: buildAppSnapshot(undefined, results, scanRoots) };
}

export function pushAllRepos(scanRoots, pushStrategy = DEFAULT_PUSH_STRATEGY) {
  const snapshot = buildAppSnapshot(undefined, undefined, scanRoots);
  const results = snapshot.repos.map(repo => executePushAll({ ...repo, detail: snapshot.repoDetails[repo.id] }, pushStrategy));
  return { results, snapshot: buildAppSnapshot(undefined, results, scanRoots) };
}

function buildFilePreviewLines(repoPath, file, staged = file.staged) {
  if (file.status === 'A' && !staged) {
    const fullPath = path.join(repoPath, file.path);
    const lines = safeReadLines(fullPath).slice(0, 160);
    return [{ type: 'hunk', content: `@@ -0,0 +1,${lines.length} @@` }, ...lines.map(line => ({ type: 'added', content: `+${line}` }))];
  }
  const args = staged
    ? ['diff', '--cached', '--no-color', '--', file.path]
    : ['diff', '--no-color', '--', file.path];
  const diff = runGit(repoPath, args);
  return diff
    .split(/\r?\n/)
    .filter(line => line && !line.startsWith('diff --git') && !line.startsWith('index ') && !line.startsWith('--- ') && !line.startsWith('+++ '))
    .slice(0, 240)
    .map(line => toDiffLine(line));
}

export function readRepoLog(repoId, scanRoots) {
  const repo = resolveRepoContext(repoId, scanRoots);
  const content = runGitStrict(repo.path, ['log', '--decorate', '--stat', '-10']);
  return {
    repoId: repo.id,
    repoName: repo.name,
    path: repo.path,
    content: content || '暂无日志内容',
  };
}

export async function generateAiCommitCandidates(repoId, aiSettings, scanRoots, styleHint) {
  ensureAiSettings(aiSettings);
  const repo = resolveRepoContext(repoId, scanRoots);
  const context = buildAiContext(repo, aiSettings, buildFilePreviewLines);
  const requestedCount = styleHint ? 1 : aiSettings.generateThree ? 3 : 1;
  const prompt = [
    aiSettings.promptTemplate.trim(),
    '',
    `仓库：${repo.name}`,
    `分支：${repo.branch}`,
    `变更来源：${aiSettings.stagedOnly ? '仅已暂存变更' : '全部变更'}`,
    `文件数：${context.paths.length}`,
    `文件列表：${context.paths.join(', ')}`,
    `候选数量：${requestedCount}`,
    styleHint
      ? `只生成 1 条「${styleHint}」风格候选。`
      : requestedCount === 3
        ? '依次返回 3 条候选：表情风格、标准短句、约定式提交。'
        : '返回 1 条最合适的约定式提交候选。',
    '输出必须是 JSON，结构如下：',
    '{"candidates":[{"style":"风格名","icon":"单个 emoji","title":"提交标题","body":"一句中文说明","full":"完整提交信息"}]}',
    '不要输出 Markdown 代码块，不要输出 JSON 之外的文字。',
    '',
    'Diff：',
    context.diff,
  ].join('\n');
  const raw = await requestAiCompletion(aiSettings, prompt);
  return parseAiCandidates(raw, styleHint);
}

function pullArgs(strategy) {
  if (strategy === 'rebase') return ['pull', '--rebase'];
  if (strategy === 'merge') return ['pull'];
  return ['pull', '--ff-only'];
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
    return ['[二进制文件]'];
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
  return `import type { AppSnapshot, CommitCandidate, PullResult, Repo, RepoDetail } from './types';

/* auto-generated by npm run sync:data */
export const INITIAL_SNAPSHOT: AppSnapshot = ${JSON.stringify(data, null, 2)};
export const SCANNED_AT = INITIAL_SNAPSHOT.scannedAt;
export const CATEGORIES: string[] = INITIAL_SNAPSHOT.categories;
export const REPOS: Repo[] = INITIAL_SNAPSHOT.repos;
export const REPO_DETAILS: Record<string, RepoDetail> = INITIAL_SNAPSHOT.repoDetails;
export const SELECTED_REPO_ID = INITIAL_SNAPSHOT.selectedRepoId;
export const FILE_CHANGES = REPO_DETAILS[SELECTED_REPO_ID]?.files ?? [];
export const PULL_RESULTS: PullResult[] = INITIAL_SNAPSHOT.pullResults;
export const COMMIT_CANDIDATES: Record<string, CommitCandidate[]> = INITIAL_SNAPSHOT.commitCandidates;
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

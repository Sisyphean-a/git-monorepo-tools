import {
  buildAppSnapshot,
  commitRepo,
  generateAiCommitCandidates,
  pullAllRepos,
  pullRepo,
  pushAllRepos,
  pushRepo,
  readRepoLog,
  stageAllRepo,
  stageRepoFile,
  unstageAllRepo,
  unstageRepoFile,
} from './sync-real-data.mjs';
import { openConflictTool, openFolder, openTerminal, pickFolder } from './local-system.mjs';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      resolve(raw ? JSON.parse(raw) : {});
    });
    req.on('error', reject);
  });
}

function ok(snapshot, extra = {}) {
  return { snapshot, ...extra };
}

async function handleApiRequest(req, res, next) {
  const requestUrl = new URL(req.url, 'http://localhost');
  const scanRoots = parseScanRoots(requestUrl.searchParams.get('scanRoots'));
  const pullStrategy = requestUrl.searchParams.get('pullStrategy') ?? undefined;
  const pushStrategy = requestUrl.searchParams.get('pushStrategy') ?? undefined;
  if (!requestUrl.pathname.startsWith('/api/')) {
    next();
    return;
  }

  try {
    if (req.method === 'GET' && requestUrl.pathname === '/api/snapshot') {
      sendJson(res, 200, ok(buildAppSnapshot(undefined, undefined, scanRoots)));
      return;
    }

    if (req.method === 'POST' && requestUrl.pathname === '/api/batch/pull') {
      const result = pullAllRepos(scanRoots, pullStrategy);
      sendJson(res, 200, ok(result.snapshot, { results: result.results, operation: 'pullAll' }));
      return;
    }

    if (req.method === 'POST' && requestUrl.pathname === '/api/batch/push') {
      const result = pushAllRepos(scanRoots, pushStrategy);
      sendJson(res, 200, ok(result.snapshot, { results: result.results, operation: 'pushAll' }));
      return;
    }

    if (req.method === 'POST' && requestUrl.pathname === '/api/system/pick-folder') {
      sendJson(res, 200, { path: pickFolder() });
      return;
    }

    const repoMatch = requestUrl.pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)$/);
    if (!repoMatch) {
      sendJson(res, 404, { error: '未找到接口' });
      return;
    }

    const [, repoId, action] = repoMatch;
    const body = req.method === 'POST' ? await readBody(req) : {};

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: '不支持的请求方法' });
      return;
    }

    if (action === 'log') {
      sendJson(res, 200, { log: readRepoLog(repoId, scanRoots) });
      return;
    }

    if (action === 'generate-commit') {
      const candidates = await generateAiCommitCandidates(repoId, body.aiCommit, scanRoots, body.styleHint);
      sendJson(res, 200, { candidates });
      return;
    }

    if (action === 'open-folder') {
      ensurePath(body.path ?? requestUrl.searchParams.get('path'));
      openFolder(body.path ?? requestUrl.searchParams.get('path'));
      sendJson(res, 200, ok(buildAppSnapshot(undefined, undefined, scanRoots)));
      return;
    }

    if (action === 'open-terminal') {
      ensurePath(body.path ?? requestUrl.searchParams.get('path'));
      openTerminal(body.path ?? requestUrl.searchParams.get('path'));
      sendJson(res, 200, ok(buildAppSnapshot(undefined, undefined, scanRoots)));
      return;
    }

    if (action === 'open-conflicts') {
      ensurePath(body.path ?? requestUrl.searchParams.get('path'));
      openConflictTool(body.path ?? requestUrl.searchParams.get('path'));
      sendJson(res, 200, ok(buildAppSnapshot(undefined, undefined, scanRoots)));
      return;
    }

    const handlers = {
      'stage-all': () => stageAllRepo(repoId, scanRoots),
      'unstage-all': () => unstageAllRepo(repoId, scanRoots),
      'stage-file': () => stageRepoFile(repoId, body.fileId, body.filePath, scanRoots),
      'unstage-file': () => unstageRepoFile(repoId, body.fileId, body.filePath, scanRoots),
      commit: () => commitRepo(repoId, body.message ?? '', scanRoots),
      pull: () => pullRepo(repoId, scanRoots, pullStrategy),
      push: () => pushRepo(repoId, scanRoots),
    };

    const handler = handlers[action];
    if (!handler) {
      sendJson(res, 404, { error: '未找到操作' });
      return;
    }

    sendJson(res, 200, ok(handler()));
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : '请求失败' });
  }
}

function parseScanRoots(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function ensurePath(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('缺少目标路径');
  }
}

export function gitApiPlugin() {
  return {
    name: 'local-git-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApiRequest(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApiRequest(req, res, next);
      });
    },
  };
}

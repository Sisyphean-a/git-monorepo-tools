import {
  buildAppSnapshot,
  commitRepo,
  pullAllRepos,
  pullRepo,
  pushAllRepos,
  pushRepo,
  stageAllRepo,
  stageRepoFile,
  unstageAllRepo,
  unstageRepoFile,
} from './sync-real-data.mjs';

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
  if (!requestUrl.pathname.startsWith('/api/')) {
    next();
    return;
  }

  try {
    if (req.method === 'GET' && requestUrl.pathname === '/api/snapshot') {
      sendJson(res, 200, ok(buildAppSnapshot()));
      return;
    }

    if (req.method === 'POST' && requestUrl.pathname === '/api/batch/pull') {
      const result = pullAllRepos();
      sendJson(res, 200, ok(result.snapshot, { results: result.results, operation: 'pullAll' }));
      return;
    }

    if (req.method === 'POST' && requestUrl.pathname === '/api/batch/push') {
      const result = pushAllRepos();
      sendJson(res, 200, ok(result.snapshot, { results: result.results, operation: 'pushAll' }));
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

    const handlers = {
      'stage-all': () => stageAllRepo(repoId),
      'unstage-all': () => unstageAllRepo(repoId),
      'stage-file': () => stageRepoFile(repoId, body.fileId, body.filePath),
      'unstage-file': () => unstageRepoFile(repoId, body.fileId, body.filePath),
      commit: () => commitRepo(repoId, body.message ?? ''),
      pull: () => pullRepo(repoId),
      push: () => pushRepo(repoId),
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

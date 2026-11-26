import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { BackendProvider } from '../application/backend-context.js';
import { wailsAppBackend } from '../infrastructure/wails-app-backend.js';
import { DEFAULT_SETTINGS } from '../infrastructure/settings-store.js';
import { TerminalWorkspaceProvider } from '../features/terminal/terminal-workspace.js';
import type { DockerProject, DockerService } from '../domain/docker-project.js';
import type { RepoDetail } from '../domain/types.js';
import { RepoDockerView } from './repo-docker-tab.js';
import { Workspace } from './workspace.js';

const noop = () => {};
const resolved = async () => {};
const service: DockerService = {
  name: 'h5-log', buildable: true, image: { name: 'h5-log:latest', id: 'new' },
  containers: [{ name: 'h5-log', state: 'running', health: 'healthy', otherImage: true, localPorts: ['127.0.0.1:3685'] }],
};
const compose: DockerProject = { files: { compose: 'compose.yaml', dockerfile: 'Dockerfile' }, engine: 'ready', services: [service] };

const render = (props: Partial<React.ComponentProps<typeof RepoDockerView>> = {}) => renderToStaticMarkup(
  <RepoDockerView project={compose} checking={false} readError="" operation={null} operationError="" showOperation={false}
    refresh={noop} request={noop} onLogs={noop} onOpenPort={noop} toggleOutput={noop} {...props} />,
);

test('keeps image and container together, with one primary action and a quiet local status footer', () => {
  const html = render();
  assert.match(html, /docker-primary[^>]*>用当前代码更新/);
  assert.equal(html.match(/class="docker-primary"/g)?.length, 1);
  assert.match(html, /h5-log:latest/);
  assert.match(html, /运行中 · 健康/);
  assert.match(html, /未使用上方镜像/);
  assert.match(html, /查看日志/);
  assert.match(html, /在浏览器打开 127.0.0.1:3685/);
  assert.match(html, /<footer.*本地 Docker 可用/);
  assert.doesNotMatch(html, /Docker 操作输出/);
});

test('does not confuse first creation with starting the existing container', () => {
  const initial = render({ project: { ...compose, services: [{ ...service, image: { name: service.image.name }, containers: [] }] } });
  assert.match(initial, /构建并启动/);
  assert.match(initial, /尚未创建/);
  assert.match(initial, /尚未构建/);
  assert.doesNotMatch(initial, /启动现有容器|查看日志/);

  const stopped = render({ project: { ...compose, services: [{ ...service, containers: service.containers.map(container => ({ ...container, state: 'exited' })) }] } });
  assert.match(stopped, /用当前代码更新/);
  assert.match(stopped, /启动现有容器/);
  assert.doesNotMatch(stopped, /已停止 · 健康/);
});

test('shows actionable connection failures and limits Dockerfile-only mode to builds', () => {
  const unavailable = render({ project: { ...compose, engine: 'unreachable', error: 'connection refused' } });
  assert.match(unavailable, /无法连接 Docker 引擎/);
  assert.match(unavailable, /connection refused/);
  assert.match(unavailable, /重新检测/);
  assert.doesNotMatch(unavailable, /用当前代码更新|构建镜像/);

  const dockerfile = render({ project: { engine: 'ready', files: { dockerfile: 'Dockerfile' }, image: { name: 'repo-h5log:local' }, services: [] } });
  assert.match(dockerfile, /docker-primary[^>]*>构建镜像/);
  assert.match(dockerfile, /暂不支持一键运行容器/);
  assert.doesNotMatch(dockerfile, /启动现有容器|查看日志/);
});

test('reports the failing stage with command output rather than implying an update succeeded', () => {
  const html = render({ operation: { id: 1, action: 'update', stage: 'launch', status: 'failed', error: '端口冲突', output: 'port already allocated' }, showOperation: true });
  assert.match(html, /启动服务：失败/);
  assert.match(html, /端口冲突/);
  assert.match(html, /port already allocated/);
  assert.doesNotMatch(html, /已完成/);
});

test('only exposes the Docker tab for the selected repository with detected files', () => {
  const first: RepoDetail = {
    id: 'first', name: 'h5Log', path: 'E:/h5Log', branch: 'main', remote: 'origin', category: 'test',
    modified: 0, ahead: 0, behind: 0, conflicts: 0, status: 'clean', lastScan: 'now',
    files: [], stagedCount: 0, unstagedCount: 0, scannedAt: 'now', history: [], historyTotal: 0, historyHasMore: false,
    dockerFiles: { compose: 'compose.yaml' },
  };
  const second: RepoDetail = { ...first, id: 'second', name: 'Other', path: 'E:/other', dockerFiles: undefined };
  const backend = { ...wailsAppBackend, onEvent: () => noop };
  const workspace = (selectedRepoId: string) => renderToStaticMarkup(
    <BackendProvider backend={backend}>
      <TerminalWorkspaceProvider runtime={backend}>
        <Workspace repoDetails={{ first, second }} selectedRepoId={selectedRepoId} settings={DEFAULT_SETTINGS}
          onRefresh={resolved} onMutateRepo={resolved} onInvokeLocalRepoAction={resolved} onRunCustomCommand={async () => { throw new Error('not used'); }}
          onOpenSettings={noop} onOpenCommands={noop} onOpenDiffViewer={noop} onOpenMonitor={noop} onOpenBackgroundTasks={noop}
          backgroundTaskCount={0} onViewLog={resolved} onFileTreeWidthChange={noop} onError={noop} />
      </TerminalWorkspaceProvider>
    </BackendProvider>,
  );
  assert.match(workspace('first'), />Docker<\/button>/);
  assert.doesNotMatch(workspace('second'), />Docker<\/button>/);
});

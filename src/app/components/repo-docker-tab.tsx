import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppBackend } from '../application/backend-context';
import { readErrorMessage } from '../application/repo-action-error';
import type { DockerAction, DockerContainer, DockerOperation, DockerOutput, DockerProject, DockerService } from '../domain/docker-project';

const engineLabels = {
  'no-config': '未找到 Docker 配置',
  'missing-cli': '未找到 Docker 命令',
  unreachable: '无法连接 Docker 引擎',
  'non-local': '当前 Docker 连接不是本地引擎',
  'missing-compose': 'Docker Compose 不可用',
  ready: '本地 Docker 可用',
};
const engineHints: Partial<Record<DockerProject['engine'], string>> = {
  'no-config': '确认仓库根目录的 Dockerfile 或 Compose 配置仍然存在。',
  'missing-cli': '安装 Docker 后，确认当前应用能找到 docker 命令。',
  unreachable: '启动 Docker Desktop 或本地 Docker 服务，并检查连接权限。',
  'non-local': '切换到本地 Docker 上下文后重新检测。',
  'missing-compose': '安装或更新 Docker Compose 插件后重试。',
};
const stageLabels: Record<DockerOperation['stage'], string> = {
  prepare: '检查环境', build: '构建镜像', launch: '启动服务', health: '检查容器',
  start: '启动容器', stop: '停止容器', restart: '重启容器',
};
const stateLabels: Record<string, string> = {
  created: '已创建', running: '运行中', exited: '已停止', restarting: '正在重启',
  paused: '已暂停', dead: '异常退出', removing: '正在移除',
};
const healthLabels: Record<string, string> = { healthy: '健康', starting: '等待健康检查', unhealthy: '不健康' };

type ActionRequest = { action: DockerAction; service: string; label: string };
type Pane = { kind: 'operation' } | { kind: 'logs'; service: string };

export function RepoDockerTab({ repoId, repoPath, windowActive }: { repoId: string; repoPath: string; windowActive: boolean }) {
  const backend = useAppBackend();
  const [project, setProject] = useState<DockerProject>();
  const [checking, setChecking] = useState(true);
  const [readError, setReadError] = useState('');
  const inspection = useRef(0);
  const [operation, setOperation] = useState<DockerOperation | null>();
  const lastOperation = useRef<DockerOperation | null>();
  const [operationError, setOperationError] = useState('');
  const [pending, setPending] = useState(false);
  const [watch, setWatch] = useState(0);
  const [pane, setPane] = useState<Pane>();
  const [confirm, setConfirm] = useState<ActionRequest>();
  const showOperation = pane?.kind === 'operation';
  const logService = pane?.kind === 'logs' ? pane.service : '';

  const refresh = useCallback(async () => {
    const sequence = ++inspection.current;
    setChecking(true);
    setReadError('');
    try {
      const next = await backend.getDockerProject(repoId, repoPath);
      if (inspection.current === sequence) setProject(next);
    } catch (error) {
      if (inspection.current === sequence) setReadError(readErrorMessage(error));
    } finally {
      if (inspection.current === sequence) setChecking(false);
    }
  }, [backend, repoId, repoPath]);

  useEffect(() => {
    if (windowActive) void refresh();
    return () => { inspection.current++; };
  }, [refresh, windowActive]);

  useEffect(() => {
    if (!windowActive) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const next = await backend.getDockerOperation(repoId, showOperation);
        if (!live) return;
        const previous = lastOperation.current;
        lastOperation.current = next;
        setOperation(next);
        if (next?.status === 'running') {
          timer = setTimeout(check, 800);
        } else if (previous?.status === 'running') {
          if (next?.status === 'failed') setPane(current => current?.kind === 'logs' ? current : { kind: 'operation' });
          void refresh();
        }
      } catch (error) {
        if (live) setOperationError(`无法读取操作状态：${readErrorMessage(error)}`);
      }
    };
    void check();
    return () => { live = false; clearTimeout(timer); };
  }, [backend, repoId, refresh, showOperation, watch, windowActive]);

  const submit = async ({ action, service }: ActionRequest) => {
    setConfirm(undefined);
    setPending(true);
    setOperationError('');
    try {
      const next = await backend.startDockerOperation(repoId, repoPath, action, service);
      lastOperation.current = next;
      setOperation(next);
      setWatch(value => value + 1);
    } catch (error) {
      setOperationError(readErrorMessage(error));
    } finally {
      setPending(false);
    }
  };
  const request = (action: DockerAction, service: string, label: string, needsConfirm = false) => {
    const input = { action, service, label };
    if (needsConfirm) setConfirm(input);
    else void submit(input);
  };
  const retry = () => {
    setOperationError('');
    setWatch(value => value + 1);
    void refresh();
  };
  const busyReason = checking ? '正在检测 Docker' : operation === undefined ? '正在读取 Docker 操作状态' : pending || operation?.status === 'running' ? 'Docker 操作正在执行' : undefined;

  return (
    <RepoDockerView project={project} checking={checking} readError={readError} busyReason={busyReason}
      operation={operation ?? null} operationError={operationError} showOperation={showOperation}
      refresh={retry} request={request} onLogs={service => setPane({ kind: 'logs', service })}
      onOpenPort={port => {
        if (/^(127\.0\.0\.1|\[::1\]):\d{1,5}$/.test(port)) backend.openExternalURL(`http://${port}`);
      }}
      toggleOutput={() => setPane(current => current?.kind === 'operation' ? undefined : { kind: 'operation' })}>
      {logService && <DockerLogPane key={logService} repoId={repoId} repoPath={repoPath} service={logService} close={() => setPane(undefined)} />}
      {confirm && <DockerConfirm request={confirm} close={() => setConfirm(undefined)} submit={() => void submit(confirm)} />}
    </RepoDockerView>
  );
}

interface DockerViewProps {
  project?: DockerProject;
  checking: boolean;
  readError: string;
  busyReason?: string;
  operation: DockerOperation | null;
  operationError: string;
  showOperation: boolean;
  refresh: () => void;
  request: (action: DockerAction, service: string, label: string, confirm?: boolean) => void;
  onLogs: (service: string) => void;
  onOpenPort: (port: string) => void;
  toggleOutput: () => void;
  children?: React.ReactNode;
}

export function RepoDockerView({ project, checking, readError, busyReason, operation, operationError, showOperation, refresh, request, onLogs, onOpenPort, toggleOutput, children }: DockerViewProps) {
  const ready = project?.engine === 'ready';
  const available = ready && !project?.error && !readError;
  const compose = project?.files.compose;
  const services = project?.services ?? [];
  const buildable = services.some(service => service.buildable);
  const created = services.some(service => service.containers.length > 0);
  const running = services.some(service => service.containers.some(c => c.state !== 'exited' && c.state !== 'created' && c.state !== 'dead'));
  const updateLabel = !buildable ? (created ? '应用服务配置' : '启动服务') : created ? '用当前代码更新' : '构建并启动';
  const engineLabel = project ? engineLabels[project.engine] : checking ? '正在检测 Docker' : 'Docker 状态未知';
  const failed = operation?.status === 'failed';
  const engineOnline = ready && !checking && !readError;
  const message = readError || project?.error;
  return (
    <section className="docker-workbench" aria-labelledby="docker-workbench-title">
      <header className="docker-heading">
        <div className="docker-heading-text">
          <h1 id="docker-workbench-title">{compose ? '服务' : project?.image ? '镜像' : 'Docker'}</h1>
          {(compose || project?.files.dockerfile) && <span className="docker-code">{compose || project?.files.dockerfile}</span>}
        </div>
        {available && compose && services.length > 0 && (
          <button type="button" className="docker-primary" disabled={Boolean(busyReason)} title={busyReason} onClick={() => request('update', '', updateLabel, running)}>{updateLabel}</button>
        )}
        {available && project?.image && (
          <button type="button" className="docker-primary" disabled={Boolean(busyReason)} title={busyReason} onClick={() => request('build', '', '构建镜像')}>构建镜像</button>
        )}
      </header>
      <div className="docker-content" aria-busy={checking}>
        {checking && !project ? <p className="docker-notice" role="status"><span className="docker-spinner" /> 正在检测 Docker…</p> : null}
        {(!available && (project || readError)) ? (
          <div className="docker-notice" role="status">
            <h2>{readError ? 'Docker 状态读取失败' : !ready ? engineLabel : '无法读取当前项目'}</h2>
            {project && engineHints[project.engine] && <p>{engineHints[project.engine]}</p>}
            {message && <p className="docker-detail-text">{message}</p>}
            <button type="button" disabled={checking} title={checking ? '正在检测 Docker' : undefined} onClick={refresh}>重新检测</button>
          </div>
        ) : null}
        {available && compose && services.length === 0 && (
          <div className="docker-notice"><h2>没有可操作的服务</h2><p>检查 Compose 配置后重新检测。</p><button type="button" disabled={checking} onClick={refresh}>重新检测</button></div>
        )}
        {available && compose && services.map(service => <ServiceRows key={service.name} service={service} busyReason={busyReason} request={request} onLogs={onLogs} onOpenPort={onOpenPort} />)}
        {available && project?.image && (
          <div className="docker-dockerfile">
            <div className="docker-row"><span>镜像</span><span className="docker-code docker-ellipsis" title={project.image.name}>{project.image.name}</span><span>{project.image.id ? '已构建' : '尚未构建'}</span></div>
            <p>未检测到 Compose 配置，暂不支持一键运行容器。</p>
          </div>
        )}
      </div>
      {operationError && <div className="docker-error docker-operation-note" role="alert">{operationError}</div>}
      {operation && <OperationProgress operation={operation} buildable={buildable} />}
      {showOperation && operation && <div className="docker-output" aria-label="Docker 操作输出"><OutputText text={operation.output ?? ''} truncated={Boolean(operation.truncated)} empty={operation.status === 'running' ? '等待命令输出…' : '此操作没有命令输出。'} /></div>}
      {children}
      <footer className="docker-footer">
        <span className="docker-footer-status" role="status"><span className={engineOnline ? 'docker-dot docker-ok' : 'docker-dot'} aria-hidden="true" />{checking ? '正在检测 Docker' : readError ? 'Docker 状态未知' : engineLabel}</span>
        {available && <button type="button" onClick={refresh} disabled={checking} title={checking ? '正在检测 Docker' : undefined}>重新检测</button>}
        {operation && <button type="button" className="docker-output-toggle" onClick={toggleOutput} aria-expanded={showOperation}>{showOperation ? '收起输出' : failed ? '查看失败输出' : '查看操作输出'}</button>}
      </footer>
    </section>
  );
}

function ServiceRows({ service, busyReason, request, onLogs, onOpenPort }: Pick<DockerViewProps, 'busyReason' | 'request' | 'onLogs' | 'onOpenPort'> & { service: DockerService }) {
  const { name, image, containers, buildable } = service;
  const isStopped = (c: DockerContainer) => c.state === 'exited' || c.state === 'created' || c.state === 'dead';
  return (
    <section className="docker-service" aria-label={`服务 ${name}`}>
      <h2 className="docker-ellipsis" title={name}>{name}</h2>
      <div className="docker-row">
        <span>镜像</span><span className="docker-code docker-ellipsis" title={image.name}>{image.name}</span><span>{buildable ? image.id ? '已构建' : '尚未构建' : image.id ? '本地已有' : '本地无镜像'}</span>
        {buildable && <div className="docker-actions"><button type="button" disabled={Boolean(busyReason)} title={busyReason} onClick={() => request('build', name, '构建镜像')}>构建镜像</button></div>}
      </div>
      <div className="docker-row docker-container-row">
        <span>容器</span>
        {containers.length ? (
          <div className="docker-container-list">
            {containers.map(container => (
              <div className="docker-container" key={container.name}>
                <span className="docker-code docker-ellipsis" title={container.name}>{container.name}</span>
                <span className={container.state === 'running' && container.health === 'unhealthy' ? 'docker-error' : container.state === 'running' && container.health === 'healthy' ? 'docker-ok' : undefined}>
                  {stateLabels[container.state] ?? container.state}{container.state === 'running' && ` · ${container.health ? healthLabels[container.health] ?? container.health : '无健康检查'}`}
                </span>
                {container.otherImage && <span className="docker-warning">未使用上方镜像</span>}
                {container.localPorts?.map(port => <button className="docker-link docker-code" type="button" key={port} onClick={() => onOpenPort(port)} aria-label={`在浏览器打开 ${port}`}>{port} ↗</button>)}
              </div>
            ))}
          </div>
        ) : <span className="docker-not-created">尚未创建</span>}
        {containers.length > 0 && (
          <div className="docker-actions docker-container-actions">
            {containers.some(isStopped) && <button type="button" disabled={Boolean(busyReason)} title={busyReason ?? '使用现有镜像，不包含新代码'} onClick={() => request('start', name, '启动现有容器')}>启动现有容器</button>}
            {containers.some(c => !isStopped(c)) && <button type="button" disabled={Boolean(busyReason)} title={busyReason} onClick={() => request('stop', name, '停止容器', true)}>停止</button>}
            <button type="button" onClick={() => onLogs(name)}>查看日志</button>
            <details className="docker-more" onKeyDown={event => {
              if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
            }}>
              <summary aria-label="更多容器操作">⋯</summary>
              <button type="button" disabled={Boolean(busyReason)} title={busyReason} onClick={event => {
                const details = event.currentTarget.closest('details');
                if (details) { details.open = false; details.querySelector('summary')?.focus(); }
                request('restart', name, '重启容器', true);
              }}>重启容器</button>
            </details>
          </div>
        )}
      </div>
    </section>
  );
}

function OperationProgress({ operation, buildable }: { operation: DockerOperation; buildable: boolean }) {
  const stages: DockerOperation['stage'][] = operation.action === 'update' ? [...(buildable ? ['build' as const] : []), 'launch', 'health'] : [];
  return (
    <div className="docker-operation-note" role={operation.status === 'failed' ? 'alert' : 'status'}>
      <span className={operation.status === 'failed' ? 'docker-error' : operation.status === 'succeeded' ? 'docker-ok' : undefined}>
        {stageLabels[operation.stage]}{operation.service ? ` · ${operation.service}` : ''}：{operation.status === 'running' ? '进行中' : operation.status === 'succeeded' ? '已完成' : '失败'}
      </span>
      {operation.status === 'running' && stages.length > 0 && <span className="docker-progress-steps">{stages.map(stage => stageLabels[stage]).join(' → ')}</span>}
      {operation.error && <p className="docker-detail-text">{operation.error}</p>}
    </div>
  );
}

function OutputText({ text, truncated, empty }: DockerOutput & { empty: string }) {
  return <>{truncated && <p>仅保留最近输出。</p>}{text ? <pre tabIndex={0}>{text}</pre> : empty ? <p>{empty}</p> : null}</>;
}

function DockerLogPane({ repoId, repoPath, service, close }: { repoId: string; repoPath: string; service: string; close: () => void }) {
  const backend = useAppBackend();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<DockerOutput>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    void backend.readDockerLogs(repoId, repoPath, service).then(value => { if (live) setResult(value); }, failure => {
      if (live) setError(readErrorMessage(failure));
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [backend, repoId, repoPath, service, revision]);
  return (
    <section className="docker-output" aria-label={`容器日志 ${service}`} aria-busy={loading}>
      <div className="docker-log-heading"><h2 className="docker-ellipsis" title={service}>容器日志 · {service}</h2><button type="button" disabled={loading} title={loading ? '正在读取日志' : undefined} onClick={() => setRevision(value => value + 1)}>刷新日志</button><button type="button" onClick={close}>收起日志</button></div>
      {error && <p className="docker-error docker-detail-text" role="alert">读取日志失败：{error}</p>}
      <OutputText text={result?.text ?? ''} truncated={Boolean(result?.truncated)} empty={loading ? '正在读取日志…' : error ? '' : '这组容器还没有日志。'} />
    </section>
  );
}

function DockerConfirm({ request, close, submit }: { request: ActionRequest; close: () => void; submit: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const dismiss = () => { dialog.current?.close(); close(); };
  const accept = () => { dialog.current?.close(); submit(); };
  return (
    <dialog ref={dialog} className="docker-confirm" role="alertdialog" aria-labelledby="docker-confirm-title" aria-describedby="docker-confirm-detail" onCancel={event => { event.preventDefault(); dismiss(); }}>
      <h2 id="docker-confirm-title">{request.label}{request.service ? ` · ${request.service}` : ''}</h2>
      <p id="docker-confirm-detail">服务可能中断。仅存于容器内存中的数据可能丢失。</p>
      <div className="docker-actions"><button type="button" autoFocus onClick={dismiss}>取消</button><button type="button" className="docker-danger" onClick={accept}>{request.label}</button></div>
    </dialog>
  );
}

import { RESOURCE_MONITOR_POLL_INTERVAL, type ResourceMonitorState } from '../domain/resource-monitor.js';

export function resourceMonitorErrorText(failure: unknown): string {
  if (failure instanceof Error) return failure.message;
  if (typeof failure === 'string') return failure;
  if (failure && typeof failure === 'object') return JSON.stringify(failure);
  return '资源监控读取失败';
}

// Flow: 面板打开期间按固定间隔读取后端采样器缓存（读取即续租高频窗口）；成功后清除读取错误，只接受更新的 revision，读请求不重叠。
export function createResourceMonitorView(options: {
  fetch: () => Promise<ResourceMonitorState>;
  onState: (state: ResourceMonitorState) => void;
  onError: (message: string | null) => void;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
  interval?: number;
}) {
  const schedule = options.schedule ?? setTimeout, cancel = options.cancel ?? clearTimeout;
  const interval = options.interval ?? RESOURCE_MONITOR_POLL_INTERVAL;
  let disposed = false, pending = false, revision = -1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stopTimer = () => { if (timer !== null) cancel(timer); timer = null; };
  const load = async () => {
    if (disposed || pending) return;
    pending = true;
    try {
      const next = await options.fetch();
      if (disposed) return;
      options.onError(null);
      // Guarantee: revision 单调递增，迟到的旧响应或后端重启后的旧序号不会覆盖当前视图。
      if (next.revision > revision) {
        revision = next.revision;
        options.onState(next);
      }
    } catch (failure) {
      if (!disposed) options.onError(resourceMonitorErrorText(failure));
    } finally {
      pending = false;
      if (!disposed) {
        stopTimer();
        timer = schedule(() => void load(), interval);
      }
    }
  };
  return {
    refresh: load,
    dispose() {
      disposed = true;
      stopTimer();
    },
  };
}

import { RESOURCE_SAMPLE_INTERVAL, type ResourceSnapshot } from '../domain/resource-monitor.js';

export function createResourceMonitorPolling(options: {
  fetch: () => Promise<ResourceSnapshot>;
  onSnapshot: (snapshot: ResourceSnapshot) => void;
  onError: (error: unknown) => void;
  onPending: (pending: boolean) => void;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const schedule = options.schedule ?? setTimeout, cancel = options.cancel ?? clearTimeout;
  let disposed = false, pending = false, active = false, epoch = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clearTimer = () => { if (timer !== null) cancel(timer); timer = null; };
  const refresh = async () => {
    if (disposed || pending || !active) return;
    clearTimer();
    pending = true;
    const revision = epoch;
    options.onPending(true);
    try {
      const snapshot = await options.fetch();
      if (!disposed && active && revision === epoch) options.onSnapshot(snapshot);
    } catch (error) {
      if (!disposed && active && revision === epoch) options.onError(error);
    } finally {
      pending = false;
      if (!disposed) {
        options.onPending(false);
        if (active) {
          // Guarantee: 快速失焦/恢复也等待旧请求收尾，再获取新采样，不叠加请求。
          if (revision !== epoch) void refresh();
          else timer = schedule(() => { timer = null; void refresh(); }, RESOURCE_SAMPLE_INTERVAL);
        }
      }
    }
  };
  return {
    refresh,
    setActive(next: boolean) {
      if (disposed || next === active) return;
      active = next;
      epoch += 1;
      clearTimer();
      if (active) void refresh();
      else options.onPending(false);
    },
    dispose() { disposed = true; active = false; clearTimer(); },
  };
}

import { TASK_LOG_BYTES, type BackgroundTaskLog } from '../../domain/background-task.js';

export function taskErrorText(failure: unknown): string {
  if (failure instanceof Error) return failure.message;
  if (typeof failure === 'string') return failure;
  return JSON.stringify(failure) ?? String(failure);
}

export interface TaskLogView {
  text: string;
  truncated: boolean;
}

function takeTail(text: string) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= TASK_LOG_BYTES) return { text, truncated: false };
  let start = bytes.length - TASK_LOG_BYTES;
  while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start++;
  return { text: new TextDecoder().decode(bytes.subarray(start)), truncated: true };
}

// Guarantee: 单个可见任务按游标读取，请求不重叠；释放后不调度、不写回迟到响应。
export function createTaskLogView(options: {
  read: (cursor: number) => Promise<BackgroundTaskLog>;
  onView: (view: TaskLogView) => void;
  onError: (error: string | null) => void;
  repeat: boolean;
  schedule?: typeof setTimeout;
  cancel?: typeof clearTimeout;
}) {
  const schedule = options.schedule ?? setTimeout, cancel = options.cancel ?? clearTimeout;
  let disposed = false, pending = false, cursor = -1;
  let view: TaskLogView = { text: '', truncated: false };
  let timer: ReturnType<typeof setTimeout> | null = null;
  const refresh = async () => {
    if (disposed || pending) return;
    if (timer !== null) cancel(timer);
    timer = null;
    pending = true;
    try {
      const result = await options.read(cursor);
      if (disposed) return;
      options.onError(null);
      if (result.text || result.reset || cursor === -1) {
        const tail = takeTail((result.reset ? '' : view.text) + result.text);
        view = { text: tail.text, truncated: result.truncated || tail.truncated || (!result.reset && view.truncated) };
        options.onView(view);
      }
      cursor = result.cursor;
    } catch (error) {
      if (!disposed) options.onError(taskErrorText(error));
    } finally {
      pending = false;
      if (!disposed && options.repeat) timer = schedule(() => void refresh(), 250);
    }
  };
  return {
    refresh,
    dispose() {
      disposed = true;
      if (timer !== null) cancel(timer);
      view = { text: '', truncated: false };
    },
  };
}

import type { RepoTerminalShortcutAction } from './repo-terminal-shortcuts.js';

export type TerminalInputTraceStage =
  | '浏览器事件'
  | 'xterm 键盘事件'
  | '快捷键处理'
  | 'xterm 输出'
  | '写入终端'
  | '后端写入完成'
  | '终端写入失败';

export interface TerminalInputTraceEntry {
  readonly sequence: number;
  readonly time: number;
  readonly stage: TerminalInputTraceStage;
  readonly detail: string;
  readonly data?: string;
}

/**
 * Rule: terminal events stream in while the observer is closed; the trace must stay bounded.
 * Effect: entries beyond the cap drop the oldest ones, and oversized data is clipped.
 */
export const MAX_TRACE_ENTRIES = 2000;
export const MAX_TRACE_DATA_CHARS = 1000;

export function clipTraceData(data: string | undefined): string | undefined {
  if (data === undefined) return undefined;
  return data.length > MAX_TRACE_DATA_CHARS ? `${data.slice(0, MAX_TRACE_DATA_CHARS)}…` : data;
}

export function appendTraceEntry(
  entries: readonly TerminalInputTraceEntry[],
  entry: TerminalInputTraceEntry,
): TerminalInputTraceEntry[] {
  const next = [...entries, entry];
  return next.length > MAX_TRACE_ENTRIES ? next.slice(next.length - MAX_TRACE_ENTRIES) : next;
}

type TerminalKeyboardEvent = Pick<KeyboardEvent,
  'type' | 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'repeat' | 'isComposing'>;

export function describeTerminalKeyboardEvent(event: TerminalKeyboardEvent) {
  const keyName = event.key.toLowerCase();
  const modifiers = [
    event.ctrlKey && keyName !== 'control' ? 'Ctrl' : '',
    event.altKey && keyName !== 'alt' ? 'Alt' : '',
    event.shiftKey && keyName !== 'shift' ? 'Shift' : '',
    event.metaKey && keyName !== 'meta' ? 'Meta' : '',
  ].filter(Boolean);
  const shortcut = [...modifiers, event.key].join('+');
  return `${event.type} ${shortcut} (code=${event.code || '未提供'}, repeat=${event.repeat}, composing=${event.isComposing})`;
}

export function describeTerminalShortcutAction(action: RepoTerminalShortcutAction): string {
  switch (action.type) {
    case 'copy-selection': return '复制选区';
    case 'paste-clipboard': return '读取剪贴板';
    case 'send-input': return '规则转换并直接写入';
    case 'pass-through': return '交给 xterm 编码';
  }
}

export function formatTerminalInputTrace(entry: TerminalInputTraceEntry) {
  const time = new Date(entry.time);
  const timestamp = [time.getHours(), time.getMinutes(), time.getSeconds()]
    .map(part => String(part).padStart(2, '0'))
    .join(':');
  const milliseconds = String(time.getMilliseconds()).padStart(3, '0');
  const data = entry.data === undefined ? '' : `  data=${JSON.stringify(entry.data)} (${entry.data.length} 字符)`;
  return `${timestamp}.${milliseconds} #${entry.sequence} ${entry.stage}: ${entry.detail}${data}`;
}

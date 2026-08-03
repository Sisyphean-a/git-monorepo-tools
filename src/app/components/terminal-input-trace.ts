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

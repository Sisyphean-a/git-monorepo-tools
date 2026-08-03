import { Copy, Trash2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { C } from '../theme';
import { TerminalOutputWriter } from '../features/terminal/terminal-output-writer';
import {
  handleWindowsTerminalShortcutEvent,
  pasteTerminalClipboard,
  type TerminalClipboardPasteSource,
} from './repo-terminal-shortcuts';
import {
  describeTerminalKeyboardEvent,
  describeTerminalShortcutAction,
  formatTerminalInputTrace,
  type TerminalInputTraceEntry,
  type TerminalInputTraceStage,
} from './terminal-input-trace';

interface TerminalInputInspectorModalProps {
  open: boolean;
  sessionId: string | null;
  entries: readonly TerminalInputTraceEntry[];
  onClear: () => void;
  onClose: () => void;
  onTrace: (stage: TerminalInputTraceStage, detail: string, data?: string) => void;
  onWriteInput: (data: string, source: string) => Promise<void>;
  onSubscribeSession: (onOutput: (chunk: string) => void, onExit: (exitCode: number) => void) => {
    bindSession: (sessionId: string) => void;
    dispose: () => void;
  };
  onReadClipboardImagePath: () => Promise<string | null>;
  onReadClipboardText: () => Promise<string>;
}

export function TerminalInputInspectorModal({
  open,
  sessionId,
  entries,
  onClear,
  onClose,
  onTrace,
  onWriteInput,
  onSubscribeSession,
  onReadClipboardImagePath,
  onReadClipboardText,
}: TerminalInputInspectorModalProps) {
  const inputViewportRef = useRef<HTMLDivElement | null>(null);
  const traceViewportRef = useRef<HTMLDivElement | null>(null);
  const traceTerminalRef = useRef<Terminal | null>(null);
  const onTraceRef = useRef(onTrace);
  const onWriteInputRef = useRef(onWriteInput);
  const onSubscribeSessionRef = useRef(onSubscribeSession);
  const onReadClipboardImagePathRef = useRef(onReadClipboardImagePath);
  const onReadClipboardTextRef = useRef(onReadClipboardText);
  const entriesRef = useRef(entries);

  onTraceRef.current = onTrace;
  onWriteInputRef.current = onWriteInput;
  onSubscribeSessionRef.current = onSubscribeSession;
  onReadClipboardImagePathRef.current = onReadClipboardImagePath;
  onReadClipboardTextRef.current = onReadClipboardText;
  entriesRef.current = entries;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose, open]);

  useEffect(() => {
    if (!open || !inputViewportRef.current || !traceViewportRef.current) return;

    const inputTerminal = createTerminal();
    const traceTerminal = createTerminal();
    inputTerminal.open(inputViewportRef.current);
    traceTerminal.open(traceViewportRef.current);
    traceTerminalRef.current = traceTerminal;
    traceTerminal.options.disableStdin = true;

    let sequence = Math.max(0, ...entriesRef.current.map(entry => entry.sequence));
    for (const entry of entriesRef.current) {
      traceTerminal.writeln(formatTerminalInputTrace(entry));
    }

    const record = (stage: TerminalInputTraceStage, detail: string, data?: string) => {
      sequence += 1;
      traceTerminal.writeln(formatTerminalInputTrace({ sequence, time: Date.now(), stage, detail, data }));
      onTraceRef.current(stage, detail, data);
    };

    const outputWriter = new TerminalOutputWriter(inputTerminal);
    const subscription = onSubscribeSessionRef.current(
      chunk => outputWriter.enqueue(chunk),
      exitCode => outputWriter.enqueue(`\r\n\x1b[90m[process exited ${exitCode}]\x1b[0m\r\n`),
    );
    const pasteDataRef: { current: ((data: string) => void) | null } = { current: null };
    const pasteClipboard = (source: TerminalClipboardPasteSource) => {
      void pasteTerminalClipboard({
        source,
        getClipboardImagePath: onReadClipboardImagePathRef.current,
        getClipboardText: onReadClipboardTextRef.current,
        transformPastedText: text => {
          let data = '';
          pasteDataRef.current = chunk => {
            data += chunk;
            record('xterm 输出', '真实 xterm 对剪贴板文本的编码结果', chunk);
          };
          try {
            inputTerminal.paste(text);
          } finally {
            pasteDataRef.current = null;
          }
          return data;
        },
        writeInput: data => onWriteInputRef.current(data, `剪贴板${source === 'keyboard' ? '快捷键' : '右键菜单'}`),
      }).catch(error => record('终端写入失败', `剪贴板读取或写入失败；${error instanceof Error ? error.message : '未知错误'}`));
    };
    subscription.bindSession(sessionId ?? '');

    record('浏览器事件', sessionId ? '真实终端输入观测已就绪；焦点在左侧终端' : '终端会话尚未就绪');
    const captureKeyboardEvent = (event: KeyboardEvent) => {
      record('浏览器事件', describeTerminalKeyboardEvent(event));
    };
    window.addEventListener('keydown', captureKeyboardEvent, true);
    inputTerminal.attachCustomKeyEventHandler(event => {
      record('xterm 键盘事件', describeTerminalKeyboardEvent(event));
      return handleWindowsTerminalShortcutEvent(event, {
        hasSelection: () => inputTerminal.hasSelection(),
        copySelection: () => record('快捷键处理', '真实终端复制选区'),
        pasteClipboard: () => pasteClipboard('keyboard'),
        writeInput: data => onWriteInputRef.current(data, '快捷键规则'),
        onShortcutAction: action => record(
          '快捷键处理',
          describeTerminalShortcutAction(action),
          action.type === 'send-input' ? action.input : undefined,
        ),
      }, window.navigator.platform ?? '');
    });
    const inputDisposable = inputTerminal.onData(data => {
      const capturePasteData = pasteDataRef.current;
      if (capturePasteData) {
        capturePasteData(data);
        return;
      }
      record('xterm 输出', '真实 xterm 编码后的输入字符', data);
      onWriteInputRef.current(data, 'xterm 输出');
    });

    requestAnimationFrame(() => inputTerminal.focus());
    return () => {
      inputDisposable.dispose();
      window.removeEventListener('keydown', captureKeyboardEvent, true);
      subscription.dispose();
      outputWriter.dispose();
      inputTerminal.dispose();
      traceTerminal.dispose();
      traceTerminalRef.current = null;
    };
  }, [open, sessionId]);

  if (!open) return null;

  const copyTrace = () => {
    navigator.clipboard.writeText(entries.map(formatTerminalInputTrace).join('\n'))
      .catch(error => console.error('复制终端输入观测失败', error));
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 90, backdropFilter: 'blur(2px)' }}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="终端输入观测"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 1180,
          maxWidth: '95vw',
          height: 'min(78vh, 640px)',
          background: C.panel1,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          zIndex: 91,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 56px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ color: C.textPrimary, fontSize: 13, fontWeight: 600, flex: 1 }}>终端输入观测</div>
          <button type="button" onClick={copyTrace} title="复制观测结果" aria-label="复制观测结果" style={iconButtonStyle}>
            <Copy size={15} />
          </button>
          <button
            type="button"
            onClick={() => {
              traceTerminalRef.current?.clear();
              onClear();
            }}
            title="清空观测结果"
            aria-label="清空观测结果"
            style={iconButtonStyle}
          >
            <Trash2 size={15} />
          </button>
          <button type="button" onClick={onClose} title="关闭" aria-label="关闭" style={iconButtonStyle}>
            <X size={16} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', flex: 1, minHeight: 0, background: '#0b1220' }}>
          <TerminalPane label="真实终端输入区域" viewportRef={inputViewportRef} />
          <TerminalPane label="输入观测结果" viewportRef={traceViewportRef} bordered />
        </div>
      </section>
    </>
  );
}

function TerminalPane({
  label,
  viewportRef,
  bordered = false,
}: {
  label: string;
  viewportRef: React.RefObject<HTMLDivElement>;
  bordered?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, borderLeft: bordered ? `1px solid ${C.border}` : 'none' }}>
      <div style={{ flexShrink: 0, padding: '8px 12px', borderBottom: `1px solid ${C.border}`, background: C.panel2, color: C.textSecondary, fontSize: 11, fontWeight: 600 }}>
        {label}
      </div>
      <div ref={viewportRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '10px 12px' }} />
    </div>
  );
}

function createTerminal() {
  return new Terminal({
    allowTransparency: true,
    cursorBlink: true,
    fontFamily: 'JetBrains Mono, Consolas, monospace',
    fontSize: 12,
    rows: 28,
    scrollback: 2000,
    theme: {
      background: '#0b1220',
      foreground: '#dbe7f5',
      cursor: '#7dd3fc',
      selectionBackground: '#1d4ed866',
      black: '#0f172a',
      blue: '#60a5fa',
      brightBlack: '#64748b',
      brightBlue: '#93c5fd',
      brightCyan: '#67e8f9',
      brightGreen: '#86efac',
      brightMagenta: '#f9a8d4',
      brightRed: '#fda4af',
      brightWhite: '#f8fafc',
      brightYellow: '#fde68a',
      cyan: '#22d3ee',
      green: '#4ade80',
      magenta: '#f472b6',
      red: '#f87171',
      white: '#e2e8f0',
      yellow: '#facc15',
    },
  });
}

const iconButtonStyle = {
  width: 28,
  height: 28,
  display: 'grid',
  placeItems: 'center',
  background: C.panel2,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  color: C.textSecondary,
  cursor: 'pointer',
} as const;

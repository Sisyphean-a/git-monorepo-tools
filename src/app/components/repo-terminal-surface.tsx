import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { ensureTerminalSession, resizeTerminal, restartTerminalSession, writeTerminalInput } from '../api';
import { terminalEventBus } from '../terminal-runtime-event-bus';
import { TerminalOutputWriter } from '../terminal-output-writer';
import { C } from '../theme';
import type { RepoDetail, TerminalSessionInfo } from '../types';

type TerminalStatus = 'idle' | 'connecting' | 'running' | 'failed' | 'exited';

export function RepoTerminalSurface({ repo, active }: { repo: RepoDetail; active: boolean }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<TerminalSessionInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionBindingRef = useRef<{ bindSession: (sessionId: string) => void; dispose: () => void } | null>(null);
  const outputWriterRef = useRef<TerminalOutputWriter | null>(null);
  const inputQueueRef = useRef(Promise.resolve());
  const resizeFrameRef = useRef<number | null>(null);

  const [status, setStatus] = useState<TerminalStatus>('idle');
  const [shellLabel, setShellLabel] = useState('终端');
  const [error, setError] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);

  const measureTerminalSize = () => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) {
      return null;
    }
    fitAddon.fit();
    const nextSize = fitAddon.proposeDimensions();
    return {
      cols: nextSize?.cols ?? terminal.cols,
      rows: nextSize?.rows ?? terminal.rows,
    };
  };

  const scheduleResize = () => {
    if (!active) return;
    if (resizeFrameRef.current !== null) {
      cancelAnimationFrame(resizeFrameRef.current);
    }
    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      const fitAddon = fitAddonRef.current;
      const session = sessionRef.current;
      if (!fitAddon) return;
      fitAddon.fit();
      const nextSize = fitAddon.proposeDimensions();
      if (session && nextSize) {
        void resizeTerminal(session.sessionId, nextSize.cols, nextSize.rows).catch(() => {});
      }
      terminalRef.current?.focus();
    });
  };

  const startSession = async (resetTerminal: boolean) => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;

    if (resetTerminal) {
      outputWriterRef.current?.reset();
      terminal.reset();
    }

    setStatus('connecting');
    setError(null);
    setExitCode(null);
    const nextSize = measureTerminalSize();
    if (!nextSize) return;

    try {
      const session = await ensureTerminalSession(repo.id, repo.path, nextSize.cols, nextSize.rows);
      sessionRef.current = session;
      setSessionId(session.sessionId);
      sessionBindingRef.current?.bindSession(session.sessionId);
      setShellLabel(session.shell);
      setStatus('running');
      scheduleResize();
    } catch (sessionError) {
      sessionRef.current = null;
      setStatus('failed');
      setError(sessionError instanceof Error ? sessionError.message : '终端启动失败');
    }
  };

  const clearSession = async () => {
    const terminal = terminalRef.current;
    const session = sessionRef.current;
    if (!terminal || !session) return;

    const nextSize = measureTerminalSize();
    if (!nextSize) return;

    outputWriterRef.current?.reset();
    terminal.reset();
    setStatus('connecting');
    setError(null);
    setExitCode(null);
    sessionBindingRef.current?.bindSession('');

    try {
      const replacement = await restartTerminalSession(session.sessionId, nextSize.cols, nextSize.rows);
      sessionRef.current = replacement;
      setSessionId(replacement.sessionId);
      sessionBindingRef.current?.bindSession(replacement.sessionId);
      setShellLabel(replacement.shell);
      setStatus('running');
      scheduleResize();
    } catch (sessionError) {
      sessionBindingRef.current?.bindSession(session.sessionId);
      setStatus('failed');
      setError(sessionError instanceof Error ? sessionError.message : '终端重启失败');
    }
  };

  useEffect(() => {
    if (!viewportRef.current || terminalRef.current) return;

    const copySelection = async (terminal: Terminal) => {
      const selection = terminal.getSelection();
      if (!selection) {
        return false;
      }
      await navigator.clipboard.writeText(selection);
      terminal.clearSelection();
      terminal.focus();
      return true;
    };

    const terminal = new Terminal({
      allowTransparency: true,
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      fontSize: 12,
      scrollback: 2000,
      scrollOnEraseInDisplay: true,
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
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(viewportRef.current);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    outputWriterRef.current = new TerminalOutputWriter(terminal);
    outputWriterRef.current.setEnabled(active);

    const contextMenuHandler = (event: MouseEvent) => {
      if (!terminal.hasSelection()) {
        return;
      }
      event.preventDefault();
      void copySelection(terminal).catch(() => {});
    };
    viewportRef.current.addEventListener('contextmenu', contextMenuHandler);

    const inputDisposable = terminal.onData(data => {
      const session = sessionRef.current;
      if (!session) return;
      inputQueueRef.current = inputQueueRef.current
        .then(() => writeTerminalInput(session.sessionId, data))
        .catch(() => {});
    });

    return () => {
      viewportRef.current?.removeEventListener('contextmenu', contextMenuHandler);
      inputDisposable.dispose();
      sessionBindingRef.current?.dispose();
      sessionBindingRef.current = null;
      outputWriterRef.current?.dispose();
      outputWriterRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    sessionBindingRef.current?.dispose();
    sessionBindingRef.current = null;
    if (!sessionId) {
      return;
    }

    sessionBindingRef.current = terminalEventBus.createSubscription({
      onOutput: chunk => {
        outputWriterRef.current?.enqueue(chunk);
      },
      onExit: exitCode => {
        sessionRef.current = null;
        setSessionId(null);
        setStatus('exited');
        setExitCode(exitCode);
        outputWriterRef.current?.enqueue(`\r\n\x1b[90m[process exited ${exitCode}]\x1b[0m\r\n`);
      },
    });
    sessionBindingRef.current.bindSession(sessionId);

    return () => {
      sessionBindingRef.current?.dispose();
      sessionBindingRef.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    outputWriterRef.current?.setEnabled(active);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    if (!sessionRef.current && status === 'idle') {
      void startSession(false);
      return;
    }
    if (sessionRef.current) {
      scheduleResize();
    }
  }, [active, status, repo.id, repo.path]);

  useEffect(() => {
    if (!active || !frameRef.current) return;
    const observer = new ResizeObserver(() => scheduleResize());
    observer.observe(frameRef.current);
    return () => observer.disconnect();
  }, [active]);

  return (
    <div
      ref={frameRef}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        visibility: active ? 'visible' : 'hidden',
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderBottom: `1px solid ${C.border}`, background: C.panel1, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ color: C.textPrimary, fontSize: 12, fontWeight: 600 }}>{shellLabel}</span>
          <span style={{ color: C.textWeak, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.path}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {status === 'running' && (
            <button
              onClick={() => void clearSession()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.panel2, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontSize: 11 }}
            >
              <RotateCcw size={12} />
              清空
            </button>
          )}
          {status !== 'running' && (
            <button
              onClick={() => void startSession(true)}
              style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}
            >
              重新打开
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#0b1220' }}>
        <div ref={viewportRef} style={{ position: 'absolute', inset: 0, padding: '10px 12px' }} />
        {status === 'connecting' && (
          <StatusOverlay text="正在启动终端..." />
        )}
        {status === 'failed' && (
          <StatusOverlay
            text={error ?? '终端启动失败'}
            tone={C.conflict}
          />
        )}
        {status === 'exited' && (
          <StatusOverlay
            text={`终端已退出${exitCode === null ? '' : `（exit ${exitCode}）`}`}
            tone={C.modified}
          />
        )}
      </div>
    </div>
  );
}

function StatusOverlay({ text, tone }: { text: string; tone?: string }) {
  return (
    <div style={{ position: 'absolute', top: 14, right: 14, background: '#0f172acc', border: `1px solid ${(tone ?? '#475569')}55`, color: tone ?? '#cbd5e1', borderRadius: 8, padding: '6px 10px', fontSize: 11, backdropFilter: 'blur(8px)' }}>
      {text}
    </div>
  );
}

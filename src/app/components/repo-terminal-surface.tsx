import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { EventsOn } from '../../../frontend/wailsjs/runtime/runtime';
import { ensureTerminalSession, resizeTerminal, writeTerminalInput } from '../api';
import { C } from '../theme';
import type { RepoDetail, TerminalSessionInfo } from '../types';

const TERMINAL_OUTPUT_EVENT = 'repo-terminal-output';
const TERMINAL_EXIT_EVENT = 'repo-terminal-exit';

type TerminalStatus = 'idle' | 'connecting' | 'running' | 'failed' | 'exited';

export function RepoTerminalSurface({ repo, active }: { repo: RepoDetail; active: boolean }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<TerminalSessionInfo | null>(null);
  const inputQueueRef = useRef(Promise.resolve());
  const resizeFrameRef = useRef<number | null>(null);

  const [status, setStatus] = useState<TerminalStatus>('idle');
  const [shellLabel, setShellLabel] = useState('终端');
  const [error, setError] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);

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
      terminal.reset();
    }

    setStatus('connecting');
    setError(null);
    setExitCode(null);
    fitAddon.fit();
    const nextSize = fitAddon.proposeDimensions();

    try {
      const session = await ensureTerminalSession(repo.id, repo.path, nextSize?.cols, nextSize?.rows);
      sessionRef.current = session;
      setShellLabel(session.shell);
      setStatus('running');
      scheduleResize();
    } catch (sessionError) {
      sessionRef.current = null;
      setStatus('failed');
      setError(sessionError instanceof Error ? sessionError.message : '终端启动失败');
    }
  };

  useEffect(() => {
    if (!viewportRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      allowTransparency: true,
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      fontSize: 12,
      scrollback: 8000,
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

    const inputDisposable = terminal.onData(data => {
      const session = sessionRef.current;
      if (!session) return;
      inputQueueRef.current = inputQueueRef.current
        .then(() => writeTerminalInput(session.sessionId, data))
        .catch(() => {});
    });

    return () => {
      inputDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    const stopOutput = EventsOn(TERMINAL_OUTPUT_EVENT, payload => {
      if (!payload || payload.sessionId !== sessionRef.current?.sessionId) return;
      terminalRef.current?.write(typeof payload.chunk === 'string' ? payload.chunk : '');
    });
    const stopExit = EventsOn(TERMINAL_EXIT_EVENT, payload => {
      if (!payload || payload.sessionId !== sessionRef.current?.sessionId) return;
      const nextExitCode = typeof payload.exitCode === 'number' ? payload.exitCode : -1;
      sessionRef.current = null;
      setStatus('exited');
      setExitCode(nextExitCode);
      terminalRef.current?.write(`\r\n\x1b[90m[process exited ${nextExitCode}]\x1b[0m\r\n`);
    });

    return () => {
      stopOutput();
      stopExit();
    };
  }, []);

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
        {status !== 'running' && (
          <button
            onClick={() => void startSession(true)}
            style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}
          >
            重新打开
          </button>
        )}
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

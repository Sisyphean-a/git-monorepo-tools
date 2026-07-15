import { C } from '../theme';
import type { RepoTerminalState } from '../features/terminal/repo-terminal-status';

interface RepoTerminalIndicatorProps {
  state?: RepoTerminalState;
  selected?: boolean;
  size?: number;
}

export function RepoTerminalIndicator({
  state = 'idle',
  selected = false,
  size = 14,
}: RepoTerminalIndicatorProps) {
  const style = resolveIndicatorStyle(state, selected);
  const dotSize = Math.max(8, Math.round(size * 0.72));

  return (
    <span
      title={resolveIndicatorLabel(state)}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          border: `1.6px solid ${style.stroke}`,
          background: style.fill,
          boxShadow: style.glow,
          boxSizing: 'border-box',
        }}
      />
    </span>
  );
}

function resolveIndicatorStyle(state: RepoTerminalState, selected: boolean) {
  if (state === 'starting') {
    return {
      stroke: C.needPull,
      fill: 'transparent',
      glow: selected ? `0 0 0 2px ${C.needPull}22` : 'none',
    };
  }
  if (state === 'running') {
    return {
      stroke: C.added,
      fill: C.added,
      glow: selected ? `0 0 0 2px ${C.added}22` : 'none',
    };
  }
  if (state === 'active') {
    return {
      stroke: C.needPull,
      fill: C.needPull,
      glow: `0 0 0 2px ${C.needPull}${selected ? '2e' : '20'}`,
    };
  }
  if (state === 'exited') {
    return {
      stroke: C.modified,
      fill: 'transparent',
      glow: 'none',
    };
  }
  if (state === 'failed') {
    return {
      stroke: C.conflict,
      fill: C.conflict,
      glow: selected ? `0 0 0 2px ${C.conflict}22` : 'none',
    };
  }
  return {
    stroke: selected ? C.textSecondary : C.textWeak,
    fill: 'transparent',
    glow: 'none',
  };
}

function resolveIndicatorLabel(state: RepoTerminalState) {
  if (state === 'starting') return '终端启动中';
  if (state === 'running') return '终端已启动';
  if (state === 'active') return '终端正在输出';
  if (state === 'exited') return '终端已退出';
  if (state === 'failed') return '终端启动失败';
  return '终端未启动';
}

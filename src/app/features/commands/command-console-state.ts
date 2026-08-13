export interface CommandConsoleState {
  sessionId: number;
  title: string;
  command: string;
  status: 'running' | 'success' | 'failed';
  output: string;
  /**
   * Rule: command output stays bounded for long-running commands.
   * Effect: once the cap is exceeded only the tail is kept and truncated is set.
   */
  truncated?: boolean;
  startedAt: number;
  endedAt?: number;
}

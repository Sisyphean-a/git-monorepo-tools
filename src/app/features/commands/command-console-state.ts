export interface CommandConsoleState {
  sessionId: number;
  title: string;
  command: string;
  status: 'running' | 'success' | 'failed';
  output: string;
  startedAt: number;
  endedAt?: number;
}

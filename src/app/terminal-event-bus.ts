const TERMINAL_OUTPUT_EVENT = 'repo-terminal-output';
const TERMINAL_EXIT_EVENT = 'repo-terminal-exit';

type TerminalOutputHandler = (chunk: string) => void;
type TerminalExitHandler = (exitCode: number) => void;
type EventUnsubscribe = () => void;

interface TerminalSessionHandlers {
  onOutput: TerminalOutputHandler;
  onExit: TerminalExitHandler;
}

interface SessionSubscription {
  sessionId: string | null;
  handlers: TerminalSessionHandlers;
}

type EventConnector = (event: string, handler: (payload: any) => void) => EventUnsubscribe;

export class TerminalEventBus {
  private readonly sessions = new Set<SessionSubscription>();
  private outputStop: EventUnsubscribe | null = null;
  private exitStop: EventUnsubscribe | null = null;

  constructor(private readonly connect: EventConnector) {}

  createSubscription(handlers: TerminalSessionHandlers) {
    const subscription: SessionSubscription = {
      sessionId: null,
      handlers,
    };
    this.sessions.add(subscription);
    this.ensureConnected();

    return {
      bindSession: (sessionId: string) => {
        subscription.sessionId = sessionId;
      },
      dispose: () => {
        this.sessions.delete(subscription);
        this.maybeDisconnect();
      },
    };
  }

  private ensureConnected() {
    if (this.outputStop || this.exitStop) {
      return;
    }

    this.outputStop = this.connect(TERMINAL_OUTPUT_EVENT, payload => {
      if (!payload || typeof payload.sessionId !== 'string') return;
      const chunk = typeof payload.chunk === 'string' ? payload.chunk : '';
      if (!chunk) return;
      for (const subscription of this.sessions) {
        if (subscription.sessionId === payload.sessionId) {
          subscription.handlers.onOutput(chunk);
        }
      }
    });

    this.exitStop = this.connect(TERMINAL_EXIT_EVENT, payload => {
      if (!payload || typeof payload.sessionId !== 'string') return;
      const exitCode = typeof payload.exitCode === 'number' ? payload.exitCode : -1;
      for (const subscription of this.sessions) {
        if (subscription.sessionId === payload.sessionId) {
          subscription.handlers.onExit(exitCode);
        }
      }
    });
  }

  private maybeDisconnect() {
    if (this.sessions.size > 0) {
      return;
    }
    this.outputStop?.();
    this.exitStop?.();
    this.outputStop = null;
    this.exitStop = null;
  }
}

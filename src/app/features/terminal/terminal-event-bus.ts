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

type EventConnector = (event: string, handler: (payload: unknown) => void) => EventUnsubscribe;

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
      const event = readRuntimePayload(payload);
      if (!event || typeof event.sessionId !== 'string') return;
      const chunk = typeof event.chunk === 'string' ? event.chunk : '';
      if (!chunk) return;
      for (const subscription of this.sessions) {
        if (subscription.sessionId === event.sessionId) {
          subscription.handlers.onOutput(chunk);
        }
      }
    });

    this.exitStop = this.connect(TERMINAL_EXIT_EVENT, payload => {
      const event = readRuntimePayload(payload);
      if (!event || typeof event.sessionId !== 'string') return;
      const exitCode = typeof event.exitCode === 'number' ? event.exitCode : -1;
      for (const subscription of this.sessions) {
        if (subscription.sessionId === event.sessionId) {
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

function readRuntimePayload(payload: unknown) {
  return payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
}

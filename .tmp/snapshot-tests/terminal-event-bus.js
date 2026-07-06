const TERMINAL_OUTPUT_EVENT = 'repo-terminal-output';
const TERMINAL_EXIT_EVENT = 'repo-terminal-exit';
export class TerminalEventBus {
    connect;
    sessions = new Set();
    outputStop = null;
    exitStop = null;
    constructor(connect) {
        this.connect = connect;
    }
    createSubscription(handlers) {
        const subscription = {
            sessionId: null,
            handlers,
        };
        this.sessions.add(subscription);
        this.ensureConnected();
        return {
            bindSession: (sessionId) => {
                subscription.sessionId = sessionId;
            },
            dispose: () => {
                this.sessions.delete(subscription);
                this.maybeDisconnect();
            },
        };
    }
    ensureConnected() {
        if (this.outputStop || this.exitStop) {
            return;
        }
        this.outputStop = this.connect(TERMINAL_OUTPUT_EVENT, payload => {
            if (!payload || typeof payload.sessionId !== 'string')
                return;
            const chunk = typeof payload.chunk === 'string' ? payload.chunk : '';
            if (!chunk)
                return;
            for (const subscription of this.sessions) {
                if (subscription.sessionId === payload.sessionId) {
                    subscription.handlers.onOutput(chunk);
                }
            }
        });
        this.exitStop = this.connect(TERMINAL_EXIT_EVENT, payload => {
            if (!payload || typeof payload.sessionId !== 'string')
                return;
            const exitCode = typeof payload.exitCode === 'number' ? payload.exitCode : -1;
            for (const subscription of this.sessions) {
                if (subscription.sessionId === payload.sessionId) {
                    subscription.handlers.onExit(exitCode);
                }
            }
        });
    }
    maybeDisconnect() {
        if (this.sessions.size > 0) {
            return;
        }
        this.outputStop?.();
        this.exitStop?.();
        this.outputStop = null;
        this.exitStop = null;
    }
}

export interface TerminalOutputSink {
  write(data: string, callback?: () => void): void;
}

export interface TerminalOutputScheduler {
  schedule(callback: () => void): number;
  cancel(handle: number): void;
}

interface TerminalOutputWriterOptions {
  maxWriteChars?: number;
  scheduler?: TerminalOutputScheduler;
}

const DEFAULT_MAX_WRITE_CHARS = 64 * 1024;

export class TerminalOutputWriter {
  private queue: string[] = [];
  private queueOffset = 0;
  private scheduled: number | null = null;
  private writing = false;
  private readonly maxWriteChars: number;
  private readonly scheduler: TerminalOutputScheduler;

  constructor(
    private readonly sink: TerminalOutputSink,
    options: TerminalOutputWriterOptions = {},
  ) {
    this.maxWriteChars = Math.max(1024, options.maxWriteChars ?? DEFAULT_MAX_WRITE_CHARS);
    this.scheduler = options.scheduler ?? createTerminalFrameScheduler();
  }

  enqueue(chunk: string) {
    if (!chunk) {
      return;
    }
    this.queue.push(chunk);
    this.schedule();
  }

  reset() {
    if (this.scheduled !== null) {
      this.scheduler.cancel(this.scheduled);
      this.scheduled = null;
    }
    this.queue = [];
    this.queueOffset = 0;
  }

  dispose() {
    this.reset();
  }

  private schedule() {
    if (this.writing || this.scheduled !== null || this.queue.length === 0) {
      return;
    }
    this.scheduled = this.scheduler.schedule(() => {
      this.scheduled = null;
      this.flushFrame();
    });
  }

  private flushFrame() {
    if (this.writing || this.queue.length === 0) {
      return;
    }
    this.writing = true;
    this.sink.write(this.takeNextPayload(), () => {
      this.writing = false;
      this.schedule();
    });
  }

  private takeNextPayload() {
    const parts: string[] = [];
    let size = 0;

    for (; this.queueOffset < this.queue.length; ) {
      const chunk = this.queue[this.queueOffset];
      if (chunk === undefined) {
        break;
      }
      const available = this.maxWriteChars - size;
      if (available <= 0) {
        break;
      }
      if (chunk.length <= available) {
        parts.push(chunk);
        size += chunk.length;
        this.queueOffset += 1;
        continue;
      }
      parts.push(chunk.slice(0, available));
      this.queue[this.queueOffset] = chunk.slice(available);
      size += available;
      break;
    }

    if (this.queueOffset > 0 && this.queueOffset >= this.queue.length) {
      this.queue = [];
      this.queueOffset = 0;
    } else if (this.queueOffset > 0 && this.queueOffset * 2 >= this.queue.length) {
      this.queue = this.queue.slice(this.queueOffset);
      this.queueOffset = 0;
    }

    return parts.join('');
  }
}

export function createTerminalFrameScheduler(): TerminalOutputScheduler {
  return {
    schedule(callback) {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        return window.requestAnimationFrame(() => callback());
      }
      return setTimeout(callback, 16) as unknown as number;
    },
    cancel(handle) {
      if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(handle);
        return;
      }
      clearTimeout(handle);
    },
  };
}

export interface TerminalOutputSink {
  write(data: string, callback?: () => void): void;
}

export interface TerminalOutputScheduler {
  schedule(callback: () => void): number;
  cancel(handle: number): void;
}

interface TerminalOutputWriterOptions {
  maxWriteChars?: number;
  maxBufferedChars?: number;
  maxDisabledBufferedChars?: number;
  compactThreshold?: number;
  scheduler?: TerminalOutputScheduler;
}

const DEFAULT_MAX_WRITE_CHARS = 64 * 1024;
const DEFAULT_MAX_BUFFERED_CHARS = 512 * 1024;
const DEFAULT_MAX_DISABLED_BUFFERED_CHARS = 128 * 1024;
const DEFAULT_COMPACT_THRESHOLD = 32;
const DROPPED_OUTPUT_NOTICE = '\r\n\x1b[90m[older terminal output skipped]\x1b[0m\r\n';

export class TerminalOutputWriter {
  private queue: string[] = [];
  private queueOffset = 0;
  private queuedChars = 0;
  private scheduled: number | null = null;
  private writing = false;
  private enabled = true;
  private droppedOutput = false;
  private readonly maxWriteChars: number;
  private readonly maxBufferedChars: number;
  private readonly maxDisabledBufferedChars: number;
  private readonly compactThreshold: number;
  private readonly scheduler: TerminalOutputScheduler;

  constructor(
    private readonly sink: TerminalOutputSink,
    options: TerminalOutputWriterOptions = {},
  ) {
    this.maxWriteChars = Math.max(1024, options.maxWriteChars ?? DEFAULT_MAX_WRITE_CHARS);
    this.maxBufferedChars = Math.max(this.maxWriteChars, options.maxBufferedChars ?? DEFAULT_MAX_BUFFERED_CHARS);
    this.maxDisabledBufferedChars = Math.max(
      this.maxWriteChars,
      options.maxDisabledBufferedChars ?? DEFAULT_MAX_DISABLED_BUFFERED_CHARS,
    );
    this.compactThreshold = Math.max(2, options.compactThreshold ?? DEFAULT_COMPACT_THRESHOLD);
    this.scheduler = options.scheduler ?? createTerminalFrameScheduler();
  }

  enqueue(chunk: string) {
    if (!chunk) {
      return;
    }
    this.queue.push(chunk);
    this.queuedChars += chunk.length;
    this.compactIfNeeded();
    this.trimOverflowIfNeeded();
    this.schedule();
  }

  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    if (!enabled) {
      if (this.scheduled !== null) {
        this.scheduler.cancel(this.scheduled);
        this.scheduled = null;
      }
      return;
    }
    this.schedule();
  }

  reset() {
    if (this.scheduled !== null) {
      this.scheduler.cancel(this.scheduled);
      this.scheduled = null;
    }
    this.queue = [];
    this.queueOffset = 0;
    this.queuedChars = 0;
    this.droppedOutput = false;
  }

  dispose() {
    this.reset();
  }

  private schedule() {
    if (!this.enabled || this.writing || this.scheduled !== null || this.queue.length === 0) {
      return;
    }
    this.scheduled = this.scheduler.schedule(() => {
      this.scheduled = null;
      this.flushFrame();
    });
  }

  private flushFrame() {
    if (!this.enabled || this.writing || this.queue.length === 0) {
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

    if (this.droppedOutput && this.maxWriteChars > DROPPED_OUTPUT_NOTICE.length) {
      parts.push(DROPPED_OUTPUT_NOTICE);
      size += DROPPED_OUTPUT_NOTICE.length;
      this.droppedOutput = false;
    }

    for (; this.queueOffset < this.queue.length; ) {
      const chunk = this.queue[this.queueOffset];
      const available = this.maxWriteChars - size;
      if (available <= 0) {
        break;
      }
      if (chunk.length <= available) {
        parts.push(chunk);
        size += chunk.length;
        this.queuedChars -= chunk.length;
        this.queueOffset += 1;
        continue;
      }
      parts.push(chunk.slice(0, available));
      this.queue[this.queueOffset] = chunk.slice(available);
      this.queuedChars -= available;
      size += available;
      break;
    }

    if (this.queueOffset > 0 && this.queueOffset >= this.queue.length) {
      this.queue = [];
      this.queueOffset = 0;
    } else if (this.queueOffset > this.compactThreshold && this.queueOffset * 2 >= this.queue.length) {
      this.queue = this.queue.slice(this.queueOffset);
      this.queueOffset = 0;
    }

    return parts.join('');
  }

  private compactIfNeeded() {
    if (this.queue.length - this.queueOffset < this.compactThreshold) {
      return;
    }
    const active = this.queue.slice(this.queueOffset);
    this.queue = [active.join('')];
    this.queueOffset = 0;
  }

  private trimOverflowIfNeeded() {
    const limit = this.enabled ? this.maxBufferedChars : this.maxDisabledBufferedChars;
    if (this.queuedChars <= limit) {
      return;
    }

    let overflow = this.queuedChars - limit;
    this.droppedOutput = true;

    for (; overflow > 0 && this.queueOffset < this.queue.length; ) {
      const chunk = this.queue[this.queueOffset];
      if (chunk.length <= overflow) {
        overflow -= chunk.length;
        this.queuedChars -= chunk.length;
        this.queueOffset += 1;
        continue;
      }
      this.queue[this.queueOffset] = chunk.slice(overflow);
      this.queuedChars -= overflow;
      overflow = 0;
    }

    if (this.queueOffset > 0 && this.queueOffset >= this.queue.length) {
      this.queue = [];
      this.queueOffset = 0;
    } else if (this.queueOffset > 0) {
      this.queue = this.queue.slice(this.queueOffset);
      this.queueOffset = 0;
    }
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

import { ServiceUnavailableException } from "@nestjs/common";

/**
 * A promise-based semaphore with a FIFO queue and a per-waiter timeout.
 *
 * Used to cap concurrent Ollama calls: the model server is CPU-bound (one
 * generation saturates a vCPU for seconds), so letting every student fire a
 * query at once would create an unbounded queue. Excess requests wait here
 * instead; if the wait exceeds `queueTimeoutMs`, they fail fast with a 503 so
 * the client can retry later instead of hanging.
 */
export class Semaphore {
  private active = 0;
  private readonly waiters: Array<{
    resolve: () => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(
    private readonly maxConcurrency: number,
    private readonly queueTimeoutMs: number,
  ) {}

  /**
   * Acquire a slot. Resolves with a release function once a slot is free
   * (immediately if below maxConcurrency). Rejects with
   * ServiceUnavailableException if the wait exceeds queueTimeoutMs.
   */
  acquire(): Promise<() => void> {
    if (this.active < this.maxConcurrency) {
      this.active += 1;
      return Promise.resolve(() => this.release());
    }

    return new Promise<() => void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === onReady);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(
          new ServiceUnavailableException(
            "AI service is at capacity right now — please retry in a moment.",
          ),
        );
      }, this.queueTimeoutMs);

      const onReady = () => {
        clearTimeout(timer);
        resolve(() => this.release());
      };

      this.waiters.push({ resolve: onReady, timer });
    });
  }

  private release(): void {
    this.active -= 1;
    const next = this.waiters.shift();
    if (next) {
      next.resolve();
    }
  }
}

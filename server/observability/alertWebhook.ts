import { setTimeout as delay } from 'node:timers/promises';
import { AlertEvent } from './types';

export class AlertWebhookDispatcher {
  private queue: AlertEvent[] = [];
  private running = false;
  private draining = false;
  private delivered = 0;
  private dropped = 0;
  private lastSuccessAt?: string;
  private lastError?: string;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(private readonly endpoint: string, private readonly token: string, private readonly timeoutMs: number) {}

  public start(replay: AlertEvent[] = []): void {
    this.running = true;
    for (const event of replay) this.enqueue(event);
  }

  public stop(): void { this.running = false; if (this.retryTimer) clearTimeout(this.retryTimer); this.retryTimer = null; }

  public enqueue(event: AlertEvent): void {
    if (!this.endpoint) return;
    if (this.queue.length >= 1_000) { this.queue.shift(); this.dropped += 1; }
    this.queue.push(JSON.parse(JSON.stringify(event)) as AlertEvent);
    if (this.running) void this.drain();
  }

  public status(): Record<string, unknown> {
    return { configured: Boolean(this.endpoint), running: this.running, queued: this.queue.length, delivered: this.delivered, dropped: this.dropped, lastSuccessAt: this.lastSuccessAt, lastError: this.lastError };
  }

  private async deliver(event: AlertEvent): Promise<void> {
    let last: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}`, 'x-brisabase-event-id': event.id },
          body: JSON.stringify({ type: 'brisabase.alert', event }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        this.delivered += 1; this.lastSuccessAt = new Date().toISOString(); this.lastError = undefined;
        return;
      } catch (error) {
        last = error;
        if (attempt < 3) await delay(250 * (2 ** attempt));
      }
    }
    throw last instanceof Error ? last : new Error('Alert webhook delivery failed.');
  }

  private async drain(): Promise<void> {
    if (this.draining || !this.running) return;
    this.draining = true;
    try {
      while (this.running && this.queue.length) {
        const event = this.queue[0];
        try { await this.deliver(event); this.queue.shift(); }
        catch (error) {
          this.lastError = error instanceof Error ? error.message : 'Alert webhook delivery failed.';
          if (!this.retryTimer) {
            this.retryTimer = setTimeout(() => { this.retryTimer = null; if (this.running) void this.drain(); }, 30_000);
            this.retryTimer.unref();
          }
          break;
        }
      }
    } finally {
      this.draining = false;
    }
  }
}

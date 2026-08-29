import { RealtimeMetrics } from './types';

export class RealtimeMetricsCollector {
  private activeConnections = 0;
  private activeChannels = 0;
  private subscriptionsCount = 0;
  private eventsPerSecond = 0;
  private messagesPerSecond = 0;
  private broadcastsPerSecond = 0;
  private averageLatencyMs = 0;
  private totalEventsProcessed = 0;
  private errorsCount = 0;
  private disconnectsCount = 0;

  private eventWindow: number[] = [];
  private messageWindow: number[] = [];
  private broadcastWindow: number[] = [];
  private latencySamples: number[] = [];
  private timer: NodeJS.Timeout | null = null;

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      // Calculate per-second rates from the last 1-second window
      const now = Date.now();
      const cutoff = now - 1000;

      this.eventsPerSecond = this.eventWindow.filter((t) => t >= cutoff).length;
      this.messagesPerSecond = this.messageWindow.filter((t) => t >= cutoff).length;
      this.broadcastsPerSecond = this.broadcastWindow.filter((t) => t >= cutoff).length;

      // Trim old samples
      this.eventWindow = this.eventWindow.filter((t) => t >= cutoff);
      this.messageWindow = this.messageWindow.filter((t) => t >= cutoff);
      this.broadcastWindow = this.broadcastWindow.filter((t) => t >= cutoff);
      this.latencySamples = this.latencySamples.slice(-100);
    }, 1000);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public recordEvent(): void {
    this.eventWindow.push(Date.now());
    this.totalEventsProcessed += 1;
  }

  public recordMessage(): void {
    this.messageWindow.push(Date.now());
  }

  public recordBroadcast(): void {
    this.broadcastWindow.push(Date.now());
  }

  public recordLatency(ms: number): void {
    this.latencySamples.push(ms);
    if (this.latencySamples.length > 100) {
      this.latencySamples.shift();
    }
    this.averageLatencyMs = this.latencySamples.length > 0
      ? Math.round((this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length) * 100) / 100
      : 0;
  }

  public recordError(): void {
    this.errorsCount += 1;
  }

  public recordDisconnect(): void {
    this.disconnectsCount += 1;
  }

  public setActiveConnections(count: number): void {
    this.activeConnections = count;
  }

  public setActiveChannels(count: number): void {
    this.activeChannels = count;
  }

  public setSubscriptionsCount(count: number): void {
    this.subscriptionsCount = count;
  }

  public getSnapshot(): RealtimeMetrics {
    return {
      activeConnections: this.activeConnections,
      activeChannels: this.activeChannels,
      subscriptionsCount: this.subscriptionsCount,
      eventsPerSecond: this.eventsPerSecond,
      messagesPerSecond: this.messagesPerSecond,
      broadcastsPerSecond: this.broadcastsPerSecond,
      averageLatencyMs: this.averageLatencyMs,
      totalEventsProcessed: this.totalEventsProcessed,
      errorsCount: this.errorsCount,
    };
  }
}
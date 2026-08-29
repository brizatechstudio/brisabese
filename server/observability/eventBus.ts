import { EventEmitter } from 'node:events';

export type ObservabilityEventType = 'log' | 'metric' | 'trace' | 'alert' | 'health' | 'audit';
export interface ObservabilityEvent<T = unknown> { type: ObservabilityEventType; payload: T; }

/** Small in-process bus. Consumers stay isolated from all engine modules. */
export class ObservabilityEventBus {
  private emitter = new EventEmitter();
  constructor() { this.emitter.setMaxListeners(30); }
  public publish<T>(type: ObservabilityEventType, payload: T): void { this.emitter.emit(type, { type, payload } satisfies ObservabilityEvent<T>); }
  public subscribe<T>(type: ObservabilityEventType, listener: (event: ObservabilityEvent<T>) => void): () => void {
    this.emitter.on(type, listener);
    return () => this.emitter.off(type, listener);
  }
}

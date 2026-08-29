export interface WebhookContext {
  organizationId: string;
  projectId: string;
  environmentId: string;
  userId?: string;
}

export interface WebhookDefinition {
  id: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  name: string;
  targetUrl: string;
  events: string[];
  customHeaders: Record<string, string>;
  active: boolean;
  maxAttempts: number;
  timeoutMs: number;
  consecutiveFailures: number;
  disabledReason?: string;
  createdAt: string;
  updatedAt: string;
  secret?: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventId: string;
  eventType: string;
  status: 'pending' | 'processing' | 'delivered' | 'failed' | 'dead_letter';
  attemptCount: number;
  responseStatus?: number;
  responseBody?: string;
  responseTimeMs?: number;
  lastError?: string;
  nextAttemptAt: string;
  createdAt: string;
  deliveredAt?: string;
}

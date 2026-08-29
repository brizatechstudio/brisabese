import { observability } from '../observability';
import { InfrastructureContext } from './types';

export class InfrastructureTelemetry {
  public event(name: string, context: InfrastructureContext, metadata: Record<string, unknown> = {}): void { observability.log('info', name, `Infrastructure event: ${name}.`, metadata, { organizationId: context.organizationId, projectId: context.projectId, environmentId: context.environmentId, userId: context.userId, requestId: context.requestId, service: 'infrastructure' }); observability.metric(`infrastructure.${name}`, 1, 'counter', {}, { organizationId: context.organizationId, projectId: context.projectId, environmentId: context.environmentId, userId: context.userId, requestId: context.requestId, service: 'infrastructure' }); }
  public metric(name: string, value: number, context: InfrastructureContext): void { observability.metric(`infrastructure.${name}`, value, 'gauge', {}, { organizationId: context.organizationId, projectId: context.projectId, environmentId: context.environmentId, userId: context.userId, requestId: context.requestId, service: 'infrastructure' }); }
}

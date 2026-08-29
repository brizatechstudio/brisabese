import { authDatabase } from '../server/db/authDatabase';
import { projectDbManager } from '../server/db/projectDatabase';
import { functionEngine } from '../server/functions/functionEngine';
import { storageEngine } from '../server/storage/storageEngine';
import { DeveloperContext } from './types';

export class Playground {
  public async run(context: DeveloperContext, input: { service: 'database' | 'auth' | 'storage' | 'functions' | 'api' | 'realtime'; action: string; payload?: any }): Promise<unknown> { if (input.service === 'database') return projectDbManager.executeQuery(context.organizationId, context.projectId, context.environmentId, input.payload?.sql || 'select 1', context.userId, { ...context, role: context.role } as any); if (input.service === 'auth') return input.action === 'users' ? authDatabase.listUsers(context.projectId, context.environmentId, String(input.payload?.search || '')) : { supported: ['users'] }; if (input.service === 'storage') return storageEngine.listBuckets({ ...context, role: context.role === 'owner' ? 'admin' : context.role } as any); if (input.service === 'functions') { const response = await functionEngine.execute(context as any, input.payload?.functionId, { method: input.payload?.method || 'POST', path: '/playground', headers: {}, query: {}, body: input.payload?.body, role: context.role, userId: context.userId, source: 'internal' }); return response; } if (input.service === 'realtime') return { supported: true, message: 'Use a channel client to subscribe or broadcast in realtime.' }; return { endpoint: input.payload?.path || '/rest/v1', method: input.payload?.method || 'GET', note: 'API playground sends no unsafe mutation automatically.' }; }
}

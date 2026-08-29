export interface FunctionTemplate {
  id: string;
  name: string;
  description: string;
  code: string;
}

const simpleTemplate = (message: string) => `export default async (req, ctx) => ({ status: 200, body: { message: ${JSON.stringify(message)} } });`;

export const functionTemplates: FunctionTemplate[] = [
  { id: 'hello-world', name: 'Hello World', description: 'HTTP function with a JSON response.', code: simpleTemplate('Hello BrisaBase!') },
  { id: 'database-query', name: 'Database Query', description: 'Queries a project-scoped table through ctx.database.', code: `export default async ({ database }) => ({ users: await database.from('users').select('*') });` },
  { id: 'send-email', name: 'Send Email', description: 'Queue an email payload for a background consumer.', code: `export default async (req, ctx) => ({ status: 202, body: await ctx.queue.enqueue('emails', await req.json()) });` },
  { id: 'stripe-webhook', name: 'Stripe Webhook', description: 'Safe starting point for an authenticated webhook.', code: `export default async (req, ctx) => { const event = await req.json(); ctx.logger.info('Stripe event received', event?.type); return { status: 200, body: { received: true } }; };` },
  { id: 'openai', name: 'OpenAI', description: 'Reads an OpenAI secret without exposing it to the frontend.', code: `export default async ({ secrets }) => ({ configured: Boolean(secrets.OPENAI_KEY) });` },
  { id: 'image-resize', name: 'Image Resize', description: 'Creates a WebP derivative through Storage.', code: `export default async ({ storage }) => storage.from('images').createSignedUrl('source.png', 3600);` },
  { id: 'pdf-generator', name: 'PDF Generator', description: 'Queue a document-generation job.', code: `export default async (req, ctx) => ({ status: 202, body: await ctx.queue.enqueue('pdf', await req.json(), { priority: 5 }) });` },
  { id: 'scheduled-task', name: 'Scheduled Task', description: 'A function intended to be attached to a cron expression.', code: `export default async ({ logger }) => { logger.info('Scheduled task running'); return { ok: true }; };` },
  { id: 'queue-consumer', name: 'Queue Consumer', description: 'Handles a background job payload.', code: `export default async (req, ctx) => { ctx.logger.info('Processing queue job'); return { processed: req.body }; };` },
  { id: 'database-trigger', name: 'Database Trigger', description: 'Broadcasts a database-related event to Realtime.', code: `export default async (req, ctx) => { const row = await req.json(); return { sent: await ctx.realtime.broadcast('database', 'record.changed', row) }; };` },
];

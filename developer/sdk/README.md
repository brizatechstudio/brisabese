# BrisaBase JavaScript / TypeScript SDK

The official browser/Node client is exposed from `developer/sdk` while the package is prepared for standalone publication.

```ts
import { createClient } from './developer/sdk';

const brisabase = createClient({
  url: 'https://your-brisabase.example.com',
  projectId: 'proj_...',
  environmentId: 'env_...',
  apiKey: 'bb_pub_...',
  onSession(session) {
    // Persist the user session if your application needs session restoration.
  },
});

await brisabase.auth.signIn({ email: 'user@example.com', password: '...' });
const rows = await brisabase.from('tasks').select('*').order('created_at', { ascending: false }).get();
await brisabase.from('tasks').insert({ title: 'Ship BrisaBase' });
```

The client covers Auth/session refresh, PostgreSQL REST CRUD, Storage, Functions, Realtime and the GraphQL transport. It deliberately never sends a public API key together with an authenticated user JWT so RLS and Storage ownership continue to evaluate the user principal.

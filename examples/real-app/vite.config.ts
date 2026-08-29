import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// The sample depends only on the public client SDK.  This workspace alias is
// intentionally the sole monorepo link; the browser bundle contains no server
// module, repository, engine, or infrastructure credential.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@brisabase/sdk': path.resolve(__dirname, '../../src/sdk/brisaBaseClient.ts'),
    },
  },
});

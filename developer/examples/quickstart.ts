import { DeveloperSdkCore } from '../sdk/core';
export const quickstart = `const client = new DeveloperSdkCore({ url: 'http://localhost:3000' });\nconst products = await client.database('products').select();`;
export const createQuickstartClient = () => new DeveloperSdkCore({ url: 'http://localhost:3000', cache: true });

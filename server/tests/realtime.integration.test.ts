import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { projectDbManager } from '../db/projectDatabase';
import { realtimeEngine } from '../realtime/realtimeEngine';
import { postgresCdc } from '../realtime/postgresCdc';
import { realtimeWebSocketServer } from '../realtime/websocketServer';
import { BrisaBaseClient } from '../../src/sdk/brisaBaseClient';

const organizationId = 'org_core_1';
const projectId = 'proj_ecommerce_1';
const environmentId = 'env_proj_ecommerce_1_production';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Realtime integration test failed: ${message}`);
}

function waitForMessage(socket: WebSocket, predicate: (message: any) => boolean, timeoutMs = 5_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for a Realtime protocol message.'));
    }, timeoutMs);
    const onMessage = (raw: WebSocket.RawData) => {
      const message = JSON.parse(raw.toString());
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    };
    socket.on('message', onMessage);
  });
}

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

async function close(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function run(): Promise<void> {
  await realtimeEngine.start();
  await postgresCdc.start();

  const store = projectDbManager.getOrCreateStore(organizationId, projectId, environmentId);
  store.tables.set('products', {
    name: 'products', schema: 'public', rowCount: 0, sizeBytes: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    columns: [{ name: 'id', type: 'uuid', isPrimaryKey: true, isNullable: false }, { name: 'name', type: 'text', isNullable: false }],
  });
  store.rows.set('products', []);

  const server = createServer();
  realtimeWebSocketServer.attach(server);
  const port = await listen(server);
  const socket = new WebSocket(`ws://127.0.0.1:${port}/realtime/v1/websocket`);

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    const authenticated = waitForMessage(socket, (message) => message.type === 'connected' && message.payload?.connectionId);
    socket.send(JSON.stringify({ type: 'connect', apiKey: 'bb_sec_ecommerce-microservices_67890' }));
    await authenticated;

    const joined = waitForMessage(socket, (message) => message.type === 'joined' && message.channel === 'products');
    socket.send(JSON.stringify({ type: 'join', channel: 'products' }));
    await joined;

    const subscribed = waitForMessage(socket, (message) => message.type === 'subscribed' && message.channel === 'products');
    socket.send(JSON.stringify({ type: 'subscribe', channel: 'products', schema: 'public', table: 'products', event: '*' }));
    await subscribed;

    const inserted = projectDbManager.insertRow(organizationId, projectId, environmentId, 'products', { name: 'Realtime product' });
    const insertEvent = await waitForMessage(socket, (message) => message.type === 'event' && message.payload?.event === 'INSERT');
    assert(insertEvent.payload.new.id === inserted.id, 'INSERT payload must contain the created record.');
    assert(insertEvent.payload.projectId === projectId && insertEvent.payload.environmentId === environmentId, 'Event must retain project/environment scope.');

    const updateEventPromise = waitForMessage(socket, (message) => message.type === 'event' && message.payload?.event === 'UPDATE');
    projectDbManager.updateRow(organizationId, projectId, environmentId, 'products', inserted.id, { name: 'Updated product' });
    const updateEvent = await updateEventPromise;
    assert(updateEvent.payload.old.name === 'Realtime product', 'UPDATE payload must retain the pre-change record.');
    assert(updateEvent.payload.new.name === 'Updated product', 'UPDATE payload must contain the new record.');

    const deleteEventPromise = waitForMessage(socket, (message) => message.type === 'event' && message.payload?.event === 'DELETE');
    projectDbManager.deleteRow(organizationId, projectId, environmentId, 'products', inserted.id);
    const deleteEvent = await deleteEventPromise;
    assert(deleteEvent.payload.old.id === inserted.id && deleteEvent.payload.new === null, 'DELETE payload must expose only the old record.');

    // The server intentionally announces that the transport is ready before
    // the async credential check completes. The SDK must wait for the second,
    // authenticated `connected` message (the one with connectionId) before it
    // joins or subscribes. This covers the race found by the Docker release gate.
    const sdk = new BrisaBaseClient({
      url: `http://127.0.0.1:${port}`,
      apiKey: 'bb_sec_ecommerce-microservices_67890',
      projectId,
      environmentId,
    });
    let sdkChannel: ReturnType<BrisaBaseClient['channel']>;
    const sdkEvent = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SDK Realtime handshake regression timed out.')), 5_000);
      sdkChannel = sdk.channel('sdk-products').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'products' }, (event) => {
        if (event.new?.name !== 'SDK Realtime product') return;
        clearTimeout(timer);
        resolve(event);
      });
    });
    await sdkChannel!.subscribe();
    projectDbManager.insertRow(organizationId, projectId, environmentId, 'products', { name: 'SDK Realtime product' });
    assert((await sdkEvent).new.name === 'SDK Realtime product', 'SDK must wait for authenticated Realtime connection before subscribing.');
    await sdkChannel!.unsubscribe();
    console.log('Realtime WebSocket integration test passed.');
  } finally {
    socket.terminate();
    realtimeWebSocketServer.close();
    await close(server);
    await postgresCdc.stop();
    await realtimeEngine.stop();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

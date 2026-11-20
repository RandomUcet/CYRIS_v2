import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { CyrisApiClient } from '../apps/web/src/lib/api-client';

const requireApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
const Fastify = requireApi('fastify') as typeof import('../apps/api/node_modules/fastify').default;

test('AI provider actions reach the API with the expected HTTP bodies', async (t) => {
  const server = Fastify();
  const path = '/admin/integrations/ai';
  server.get(path, async () => []);
  server.post(path + '/test-connection', async request => ({ body: request.body }));
  server.put(path + '/:id', async request => ({ body: request.body }));
  server.delete(path + '/:id', async request => ({
    success: request.body === undefined && request.headers['content-type'] === undefined,
  }));
  const address = await server.listen({ host: '127.0.0.1', port: 0 });
  t.after(() => server.close());
  const client = new CyrisApiClient(address);
  assert.deepEqual((await client.listAIProviders()).data, []);
  assert.deepEqual((await client.testAIConnection({ providerId: 'spark' })).data, { body: { providerId: 'spark' } });
  assert.deepEqual((await client.updateAIProvider('spark', { enabled: true })).data, { body: { enabled: true } });
  assert.deepEqual(await client.deleteAIProvider('custom'), { ok: true, data: { success: true } });
});

/* eslint-disable no-console */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LRUCache } from 'lru-cache';
import { MemoryAdapter } from 'bpmn-middleware';

import { createApp } from './app.js';
import { startWorker } from './worker.js';

const port = Number(process.env.PORT) || 3001;
const processesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'processes');

const url = process.env.AMQP_URL || 'amqp://localhost';

const storage = new LRUCache({ max: 1000 });

const app = await createApp({ url, adapter: new MemoryAdapter(storage) });
const workers = await Promise.all(['worker-1', 'worker-2'].map((name) => startWorker({ url, name, adapter: new MemoryAdapter(storage) })));

const httpServer = app.listen(port);
await new Promise((resolve) => httpServer.once('listening', resolve));
const baseUrl = `http://localhost:${port}`;

for (const name of ['amqp-order', 'amqp-fulfilment']) {
  const form = new FormData();
  form.append('deployment-name', name);
  form.append('deployment-source', 'example');
  form.append(`${name}.bpmn`, new Blob([await readFile(join(processesDir, `${name}.bpmn`))]), `${name}.bpmn`);
  const response = await fetch(`${baseUrl}/rest/deployment/create`, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`failed to deploy ${name}: ${response.status} ${await response.text()}`);
  console.log(`deployed ${name}`);
}

console.log(`api listening on ${baseUrl}, e.g. POST ${baseUrl}/start/amqp-order`);

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

async function shutdown() {
  console.log('shutting down');
  httpServer.close();
  await Promise.all(workers.map((worker) => worker.close()));
  await app.locals.close();
}

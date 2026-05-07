import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { buildSwaggerDocument } from '@aller/express-swagger';

import { app } from './app.js';

const tsconfig = new URL('./tsconfig.json', import.meta.url);
const out = new URL('./swagger.json', import.meta.url);

const doc = await buildSwaggerDocument(app, { tsconfig });

await writeFile(out, JSON.stringify(doc, null, 2) + '\n');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`Wrote OpenAPI document to ${fileURLToPath(out)}\n`);
}

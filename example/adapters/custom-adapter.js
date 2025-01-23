import fs, { promises as fsp } from 'node:fs';
import { basename, join } from 'node:path';
import { MemoryAdapter, STORAGE_TYPE_FILE, STORAGE_TYPE_DEPLOYMENT, HttpError } from '../../src/index.js';
import { LRUCache } from 'lru-cache';

export class CustomAdapter extends MemoryAdapter {
  /**
   * @param {string} rootFolder
   * @param {import('lru-cache').LRUCache} [storage]
   */
  constructor(rootFolder, storage) {
    super(storage ?? new LRUCache({ max: 1000, allowStale: false, fetchMethod: fetchMethod.bind(null, rootFolder) }));
    this.rootFolder = rootFolder;
  }
}

async function fetchMethod(rootFolder, fetchKey) {
  const [type, key, ...restKey] = fetchKey.split(':');

  if (type === STORAGE_TYPE_DEPLOYMENT && key === 'fs' && restKey.length) {
    const fileName = `${basename(restKey.join(''))}.bpmn`;
    const filePath = join(rootFolder, fileName);

    await fsp.stat(filePath).catch((err) => {
      /* c8 ignore next */
      if (err.code !== 'ENOENT') throw err;
      throw new HttpError(`deployment ${filePath} not found`, 404);
    });

    return JSON.stringify([{ path: filePath }]);
  }
  if (type === STORAGE_TYPE_FILE) {
    return readFileContent(key).catch((err) => {
      /* c8 ignore next */
      if (err.code !== 'ENOENT') throw err;
      throw new HttpError(`file ${key} not found`, 404);
    });
  }
}

function readFileContent(file) {
  return new Promise((resolve, reject) => {
    let content = '';
    let size = 0;
    fs.createReadStream(file)
      .on('data', (chunk) => {
        size += chunk.byteLength;
        content += chunk;
      })
      .on('end', () => {
        return resolve(JSON.stringify({ mimetype: 'text/xml', size, content }));
      })
      .on('error', reject);
  });
}

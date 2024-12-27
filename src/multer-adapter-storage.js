import { STORAGE_TYPE_FILE } from './constants.js';

/**
 * Multer adapter storage
 * @param {import('types').IStorageAdapter} adapter
 */
export function MulterAdapterStorage(adapter) {
  this.adapter = adapter;
}

/**
 * Handle Multipart file content
 * @param {import('express').Request} _
 * @param {any} file
 * @param {CallableFunction} callback
 */
MulterAdapterStorage.prototype._handleFile = function handleFile(_, file, callback) {
  let content = '';
  let size = 0;
  const fileName = file.originalname;

  file.stream
    // @ts-ignore
    .on('data', (chunk) => {
      size += chunk.byteLength;
      content += chunk;
    })
    .on('end', async () => {
      try {
        await this.adapter.upsert(STORAGE_TYPE_FILE, fileName, { ...file, content });
        return callback(null, { path: fileName, size });
      } catch (err) {
        return callback(err);
      }
    })
    .on('error', callback);
};

/**
 *
 * @param {import('express').Request} _
 * @param {any} file
 * @param {CallableFunction} callback
 */
MulterAdapterStorage.prototype._removeFile = async function removeFile(_, file, callback) {
  try {
    await this.adapter.delete(STORAGE_TYPE_FILE, file.originalname);
  } finally {
    callback();
  }
};

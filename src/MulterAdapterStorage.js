import { STORAGE_TYPE_FILE } from './constants.js';

export function MulterAdapterStorage(adapter) {
  this.adapter = adapter;
}

MulterAdapterStorage.prototype._handleFile = function handleFile(req, file, callback) {
  let content = '';
  let size = 0;
  const fileName = file.originalname;

  file.stream
    .on('data', (chunk) => {
      size += chunk.byteLength;
      content += chunk;
    })
    .on('end', async () => {
      try {
        await this.adapter.upsert(STORAGE_TYPE_FILE, fileName, content);
        return callback(null, { path: fileName, size });
      } catch (err) {
        return callback(err);
      }
    })
    .on('error', callback);
};

MulterAdapterStorage.prototype._removeFile = function removeFile(req, file, callback) {
  callback();
};

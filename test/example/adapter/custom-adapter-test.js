import { CustomAdapter } from '../../../example/adapters/custom-adapter.js';
import { STORAGE_TYPE_FILE } from '../../../src/index.js';

describe('custom adapter', () => {
  it('throws if file is not found', async () => {
    const adapter = new CustomAdapter('/');

    try {
      await adapter.fetch(STORAGE_TYPE_FILE, 'fs:nothere');
    } catch (err) {
      // eslint-disable-next-line no-var
      var error = err;
    }

    expect(error.statusCode).to.equal(404);
  });
});

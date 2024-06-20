import { LRUCache } from 'lru-cache';

import { STORAGE_TYPE_STATE } from './constants.js';

/**
 * Memory adapter
 * @param {import('lru-cache').LRUCache<string, any>} [storage]
 */
export function MemoryAdapter(storage) {
  /** @type {import('lru-cache').LRUCache<string, any>} */
  this.storage = storage || new LRUCache({ max: 1000 });
}

/**
 * Upsert
 * @param {string} type
 * @param {string} key
 * @param {any} value
 * @param {any} [options]
 */
MemoryAdapter.prototype.upsert = function upsert(type, key, value, options) {
  const storageKey = `${type}:${key}`;
  switch (type) {
    case STORAGE_TYPE_STATE: {
      const current = this.storage.get(storageKey);
      // @ts-ignore
      const { engine, ...saved } = current ? JSON.parse(current) : {};
      this.storage.set(storageKey, JSON.stringify({ ...saved, ...value }), options);
      break;
    }
    default:
      this.storage.set(storageKey, JSON.stringify(value), options);
  }
  return Promise.resolve();
};

/**
 * Delete
 * @param {string} type
 * @param {string} key
 */
MemoryAdapter.prototype.delete = function deleteByKey(type, key) {
  this.storage.delete(`${type}:${key}`);
  return Promise.resolve();
};

/**
 * Fetch
 * @param {string} type
 * @param {string} key
 * @param {any} [options]
 */
MemoryAdapter.prototype.fetch = async function fetch(type, key, options) {
  const value = await this.storage.fetch(`${type}:${key}`, options);
  if (!value) return value;

  const data = JSON.parse(value);

  if (options?.exclude) {
    for (const field of options.exclude) {
      delete data[field];
    }
  }

  return data;
};

/**
 * Query
 * @param {string} type
 * @param {any} qs
 */
MemoryAdapter.prototype.query = function query(type, qs) {
  let records = [];
  switch (type) {
    case STORAGE_TYPE_STATE:
      records = this._queryState(qs);
      break;
  }

  return Promise.resolve({ records });
};

/**
 * Internal query state
 * @param {any} qs
 */
MemoryAdapter.prototype._queryState = function queryState(qs) {
  const { state, caller, exclude /* activityStatus: [] limit, offset, order_by*/ } = qs;

  const result = [];
  for (const [key, value] of this.storage.entries()) {
    if (!key.startsWith(`${STORAGE_TYPE_STATE}:`)) continue;
    const engineState = JSON.parse(value);
    if (state && engineState.state !== state) continue;
    if (caller && !engineState.caller) continue;
    else if (caller) {
      if (engineState.caller.token !== caller.token) continue;
      if (engineState.caller.executionId !== caller.executionId) continue;
    }

    if (exclude?.length) {
      for (const field of exclude) {
        delete engineState[field];
      }
    }

    result.push(engineState);
  }

  return result;
};

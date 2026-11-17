/**
 * Memory adapter
 * @param {import('lru-cache').LRUCache<string, any>} [storage]
 */
export function MemoryAdapter(storage?: import("lru-cache").LRUCache<string, any>): void;
export class MemoryAdapter {
    /**
     * Memory adapter
     * @param {import('lru-cache').LRUCache<string, any>} [storage]
     */
    constructor(storage?: import("lru-cache").LRUCache<string, any>);
    /** @type {import('lru-cache').LRUCache<string, any>} */
    storage: import("lru-cache").LRUCache<string, any>;
    /**
     * Upsert
     * @param {string} type storage type
     * @param {string} key storage key
     * @param {any} value value to store
     * @param {any} [options] storage set options
     */
    upsert(type: string, key: string, value: any, options?: any): Promise<void>;
    /**
     * Update existing
     * @param {string} type storage type
     * @param {string} key storage key
     * @param {any} value value to store
     * @param {any} [options] storage set options
     * @throws {StorageError}
     */
    update(type: string, key: string, value: any, options?: any): Promise<void>;
    delete(type: string | import("./interfaces.js").StorageType, key: string, options?: any): Promise<any | undefined>;
    /**
     * Fetch
     * @param {string} type
     * @param {string} key
     * @param {any} [options] Passed as fetch options to LRU cache
     */
    fetch(type: string, key: string, options?: any): Promise<any>;
    query<T>(type: string | import("./interfaces.js").StorageType, qs: import("./interfaces.js").StorageQuery, options?: any): Promise<{
        records: T[];
        [x: string]: any;
    }>;
    /**
     * Internal query state
     * @internal
     * @param {any} qs
     */
    _queryState(qs: any): any[];
}
//# sourceMappingURL=memory-adapter.d.ts.map
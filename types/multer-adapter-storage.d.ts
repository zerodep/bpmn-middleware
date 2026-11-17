/**
 * Multer adapter storage
 * @param {import('./interfaces.js').IStorageAdapter} adapter
 */
export function MulterAdapterStorage(adapter: import("./interfaces.js").IStorageAdapter): void;
export class MulterAdapterStorage {
    /**
     * Multer adapter storage
     * @param {import('./interfaces.js').IStorageAdapter} adapter
     */
    constructor(adapter: import("./interfaces.js").IStorageAdapter);
    adapter: import("./interfaces.js").IStorageAdapter;
    /**
     * Handle Multipart file content
     * @param {import('express').Request} _
     * @param {any} file
     * @param {CallableFunction} callback
     */
    _handleFile(_: import("express").Request, file: any, callback: CallableFunction): void;
    /**
     *
     * @param {import('express').Request} _
     * @param {any} file
     * @param {CallableFunction} callback
     */
    _removeFile(_: import("express").Request, file: any, callback: CallableFunction): Promise<void>;
}
//# sourceMappingURL=multer-adapter-storage.d.ts.map
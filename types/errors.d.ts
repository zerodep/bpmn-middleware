export class HttpError extends Error {
    /**
     * Error with status code
     * @param {string} message Error message
     * @param {number} statusCode HTTP status code
     * @param {string} [code] Error code
     */
    constructor(message: string, statusCode: number, code?: string);
    statusCode: number;
    code: string;
}
export class StorageError extends Error {
    /**
     * Error with status code
     * @param {string} message Error message
     * @param {string} [code] Error code
     */
    constructor(message: string, code?: string);
    code: string;
}
//# sourceMappingURL=errors.d.ts.map
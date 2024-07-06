export class HttpError extends Error {
  /**
   * Error with status code
   * @param {string} message Error message
   * @param {number} statusCode HTTP status code
   */
  constructor(message, statusCode) {
    super(message);
    Error.captureStackTrace(this, HttpError);
    this.statusCode = statusCode;
  }
}

export class StorageError extends Error {
  /**
   * Error with status code
   * @param {string} message Error message
   * @param {string} code Error code
   */
  constructor(message, code) {
    super(message);
    Error.captureStackTrace(this, StorageError);
    this.code = code;
  }
}

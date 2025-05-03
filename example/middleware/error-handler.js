import { HttpError } from '../../src/index.js';

/**
 * Error handler
 * @param {Error} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function errorHandler(err, _req, res, next) {
  /* c8 ignore next 1 */
  if (!(err instanceof Error) || res.headersSent) return next();
  if (err instanceof HttpError) return res.status(err.statusCode).send({ message: err.message });
  res.status(502).send({ message: err.message });
}

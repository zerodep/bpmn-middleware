import { timingSafeEqual, randomUUID } from 'node:crypto';
import { HttpError } from '../../src/index.js';

/**
 * Basic auth middleware
 * @param {import('types').IStorageAdapter} [adapter]
 * @param {boolean} [allowAnonymous]
 */
export function basicAuth(adapter, allowAnonymous) {
  /**
   * Basic auth
   * @param {import('express').Request} req
   * @param {import('express').Response<any, {user:User}>} res
   * @param {import('express').NextFunction} next
   */
  return async function basicAuth(req, res, next) {
    const authHeader = req.get('Authorization');
    if (!authHeader) {
      if (allowAnonymous) return next();
      return sendUnauthorized(res);
    }

    const auth = Buffer.from(req.get('Authorization').substring(6), 'base64').toString();
    const [username, password] = auth.split(':');

    try {
      const user = await authenticate(adapter, username, password);
      if (!user && !allowAnonymous) {
        return sendUnauthorized(res);
      }

      res.locals.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Authenticate user
 * @param {import('types').IStorageAdapter} adapter
 * @param {string} username
 * @param {string} password
 * @returns {Promise<User|undefined>} user
 */
async function authenticate(adapter, username, password) {
  /** @type {User} */
  const user = await adapter.fetch('user', username.toLowerCase());
  const challengePassword = Buffer.from(password || randomUUID());

  if (!user) {
    timingSafeEqual(challengePassword, challengePassword);
    return;
  }

  const { password: userPassword, ...rest } = user;

  const bufferSize = challengePassword.length > userPassword.length ? challengePassword.length : userPassword.length;

  if (!timingSafeEqual(Buffer.alloc(bufferSize, userPassword), Buffer.alloc(bufferSize, challengePassword))) {
    return;
  }

  return { username, ...rest };
}

/**
 * Basic auth
 * @param {import('express').Request} _req
 * @param {import('express').Response<any, {user:import('./auth.js').User}>} res
 * @param {import('express').NextFunction} next
 */
export async function authorize(_req, res, next) {
  try {
    /** @type {import('bpmn-engine').Engine} */
    const engine = res.locals.engine;
    const user = res.locals.user;

    const [definition] = await engine.getDefinitions();
    const [process] = definition.context.getExecutableProcesses();

    if (process.behaviour.candidateStarterGroups) {
      if (!user?.role?.length) {
        throw new HttpError('Forbidden', 403);
      }

      const roles = new Set(process.behaviour.candidateStarterGroups.split(',').filter(Boolean));
      if (!user.role.some((r) => roles.has(r))) {
        throw new HttpError('Forbidden', 403);
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Send unauthorized
 * @param {import('express').Response} res;
 */
function sendUnauthorized(res) {
  res.set('WWW-Authenticate', 'Basic realm=bpmn-engine');
  return res.sendStatus(401);
}

/**
 * User
 * @typedef {Object} User
 * @property {string} username
 * @property {string} name
 * @property {string[]} [role]
 * @property {string} [password]
 */

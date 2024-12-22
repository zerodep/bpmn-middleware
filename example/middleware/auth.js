import { timingSafeEqual, randomUUID, randomBytes, pbkdf2 } from 'node:crypto';
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
    const missingSalt = randomBytes(16).toString('hex');
    const challengeString = Buffer.from(await hashPassword(missingSalt, challengePassword));
    timingSafeEqual(challengeString, challengeString);
    return;
  }

  const { salt, password: userPassword, ...rest } = user;

  const challengeString = await hashPassword(salt, challengePassword);

  if (!timingSafeEqual(Buffer.from(userPassword), Buffer.from(challengeString))) {
    return;
  }

  return { ...rest, username };
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
 * Add User
 * @param {import('../../types/interfaces.js').IStorageAdapter} adapter
 * @param {User} newUser
 */
export async function addUser(adapter, newUser) {
  const salt = randomBytes(16).toString('hex');
  const password = await hashPassword(salt, newUser.password);

  const user = JSON.parse(JSON.stringify({ ...newUser, salt, password }));

  await adapter.upsert('user', newUser.username.toLowerCase(), user);
}

function hashPassword(salt, password) {
  return new Promise((resolve, reject) =>
    pbkdf2(Buffer.from(password), salt, 100000, 64, 'sha512', (err, hash) => {
      /* c8 ignore next */
      if (err) return reject(err);
      return resolve(hash.toString('hex'));
    })
  );
}

/**
 * User
 * @typedef {Object} User
 * @property {string} username
 * @property {string} name
 * @property {string[]} [role]
 * @property {string} [salt]
 * @property {string} [password]
 */

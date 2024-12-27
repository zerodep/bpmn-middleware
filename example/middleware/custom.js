import { HttpError } from 'bpmn-middleware';

/**
 * Custom start function
 * @param {import('express').Request} req
 * @param {import('express').Response<any, {engine:import('bpmn-middleware').MiddlewareEngine, engines:import('bpmn-middleware').Engines}>} res
 * @param {import('express').NextFunction} next
 */
export async function runToEnd(req, res, next) {
  try {
    const { engine, engines } = res.locals;

    if (engine.state === 'error') {
      return next(new HttpError('run failed', 500));
    } else if (engine.state === 'idle') {
      return res.send(engine.environment.output);
    }

    engine.environment.timers.register({ name: res.locals.middlewareName }).setTimeout(() => {
      engine.stop();
    }, 60000);

    await new Promise((resolve, reject) => {
      engine.broker.subscribeTmp(
        'event',
        'engine.*',
        (routingKey, msg) => {
          switch (routingKey) {
            case 'engine.error':
              reject(msg.content);
              break;
            case 'engine.stop':
              reject(new HttpError('run timed out', 504));
              break;
            case 'engine.end':
              resolve();
              break;
          }
        },
        { noAck: true }
      );
    });

    if ('delete' in req.query) {
      await engines.deleteByToken(res.locals.token);
    }

    return res.send({ token: res.locals.token, output: engine.environment.output });
  } catch (err) {
    next(err);
  }
}

/**
 * Custom start function
 * @type {import('connect').NextHandleFunction}
 * @param {import('express').Request} req
 * @param {import('express').Response<any, {engine:import('bpmn-middleware').MiddlewareEngine}>} res
 * @param {import('express').NextFunction} next
 */
export function signal(req, res, next) {
  /** @type {import('bpmn-middleware').MiddlewareEngine} */
  const engine = res.locals.engine;
  engine.execution.signal(req.body);
  return runToEnd(req, res, next);
}

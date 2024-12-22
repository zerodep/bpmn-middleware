import { HttpError } from 'bpmn-middleware';

/**
 * Custom start function
 * @param {import('express').Request} _req
 * @param {import('express').Response<any, {engine:import('bpmn-middleware').MiddlewareEngine}>} res
 * @param {import('express').NextFunction} next
 */
export async function runToEnd(_req, res, next) {
  try {
    /** @type {import('bpmn-middleware').MiddlewareEngine} */
    const engine = res.locals.engine;

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

    return res.send(engine.environment.output);
  } catch (err) {
    next(err);
  }
}

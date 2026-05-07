import { HttpError } from 'bpmn-middleware';

/**
 * @typedef {object} SyncRunResult
 * @property {string} token Engine execution token
 * @property {Record<string, any>} [output] Engine environment output
 */

/**
 * Run a deployment synchronously and respond with the engine's final output.
 * Slot types mirror the start-deployment chain (`/start/sync/:deploymentName`)
 * since this handler is wired as the terminal of `middleware.start(runToEnd)`.
 * @param {import('express').Request<import('bpmn-middleware').StartDeployment, SyncRunResult, import('bpmn-middleware').StartDeploymentOptions, import('bpmn-middleware').ExecuteOptions>} req
 * @param {import('express').Response<SyncRunResult>} res
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
 * Signal a waiting activity and run the engine to completion.
 * @param {import('express').Request<{token:string}, import('bpmn-middleware').MiddlewareEngineState, import('bpmn-middleware').SignalBody>} req
 * @param {import('express').Response<import('bpmn-middleware').MiddlewareEngineState>} res
 * @param {import('express').NextFunction} next
 */
export function signal(req, res, next) {
  /** @type {import('bpmn-middleware').MiddlewareEngine} */
  const engine = res.locals.engine;
  engine.execution.signal(req.body);
  return runToEnd(req, res, next);
}

import { Router } from 'express';
import multer from 'multer';

import { DEFAULT_IDLE_TIMER } from './constants.js';
import { MulterAdapterStorage } from './MulterAdapterStorage.js';
import { Engines } from './Engines.js';
import { MemoryAdapter } from './MemoryAdapter.js';
import { HttpError, StorageError } from './Errors.js';
import { MiddlewareEngine } from './MiddlewareEngine.js';

import { BpmnEngineMiddleware } from './bpmn-middleware.js';
export { BpmnEngineMiddleware } from './bpmn-middleware.js';

export { Engines, MemoryAdapter, HttpError, StorageError, MiddlewareEngine };
export * from './constants.js';

/**
 * BPMN 2 Engine middleware
 * @param {import('types').BpmnMiddlewareOptions} options
 */
export function bpmnEngineMiddleware(options) {
  const adapter = options?.adapter || new MemoryAdapter();
  const engines = new Engines({
    adapter,
    idleTimeout: DEFAULT_IDLE_TIMER,
    autosaveEngineState: true,
    ...options,
  });

  const storage = new MulterAdapterStorage(adapter);
  const middleware = new BpmnEngineMiddleware({ ...options, adapter }, engines);

  const router = Router({ mergeParams: true });

  let initialized = false;

  router.use((req, res, next) => {
    if (initialized) return next();
    initialized = true;
    return middleware.init(req, res, next);
  });
  router.get('(*)?/version', middleware.getVersion.bind(middleware));
  router.get('(*)?/deployment', middleware.getDeployment.bind(middleware));
  router.post('(*)?/deployment/create', multer({ storage }).any(), middleware.create.bind(middleware));
  router.post('(*)?/process-definition/:deploymentName/start', middleware.start());
  router.post('(*)?/resume/:token', middleware.resume());
  router.post('(*)?/signal/:token', middleware.signal());
  router.post('(*)?/cancel/:token', middleware.cancel());
  router.get('(*)?/script/:deploymentName', middleware.preStart(), middleware.getScript.bind(middleware));
  router.get('(*)?/timers/:deploymentName', middleware.preStart(), middleware.getDeploymentTimers.bind(middleware));
  router.get('(*)?/running', middleware._addEngineLocals, middleware.getRunning.bind(middleware));
  router.get('(*)?/status/:token', middleware._addEngineLocals, middleware.getStatusByToken.bind(middleware));
  router.get('(*)?/status/:token/:activityId', middleware._addEngineLocals, middleware.getActivityStatus.bind(middleware));
  router.post('(*)?/fail/:token', middleware.preResume(), middleware.failActivity.bind(middleware));
  router.get('(*)?/state/:token', middleware._addEngineLocals, middleware.getStateByToken.bind(middleware));
  router.delete('(*)?/state/:token', middleware._addEngineLocals, middleware.deleteStateByToken.bind(middleware));
  router.delete('(*)?/internal/stop', middleware._addEngineLocals, middleware.internalStopAll.bind(middleware));
  router.delete('(*)?/internal/stop/:token', middleware._addEngineLocals, middleware.internalStopByToken.bind(middleware));

  Object.defineProperties(router, {
    engines: {
      value: engines,
      enumerable: true,
    },
    middleware: {
      value: middleware,
      enumerable: true,
    },
  });

  return router;
}

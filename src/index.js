import { Router, json } from 'express';
import multer from 'multer';

import { MulterAdapterStorage } from './multer-adapter-storage.js';
import { Engines } from './engines.js';
import { MemoryAdapter } from './memory-adapter.js';
import { HttpError, StorageError } from './errors.js';
import { MiddlewareEngine } from './middleware-engine.js';

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
  const storage = new MulterAdapterStorage(adapter);
  const middleware = new BpmnEngineMiddleware({ autosaveEngineState: true, ...options, adapter });

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
  router.post('(*)?/fail/:token', middleware.fail());
  router.get('(*)?/script/:deploymentName', middleware.preStart(), middleware.getScript.bind(middleware));
  router.get('(*)?/timers/:deploymentName', middleware.preStart(), middleware.getDeploymentTimers.bind(middleware));
  router.get('(*)?/running', middleware.addResponseLocals(), middleware.getRunning.bind(middleware));
  router.get('(*)?/status/:token', middleware.addResponseLocals(), middleware.getStatusByToken.bind(middleware));
  router.get('(*)?/status/:token/:activityId', middleware.addResponseLocals(), middleware.getActivityStatus.bind(middleware));
  router.get('(*)?/state/:token', middleware.addResponseLocals(), middleware.getStateByToken.bind(middleware));
  router.delete('(*)?/state/:token', json(), middleware.addResponseLocals(), middleware.deleteStateByToken.bind(middleware));
  router.delete('(*)?/internal/stop', middleware.addResponseLocals(), middleware.internalStopAll.bind(middleware));
  router.delete('(*)?/internal/stop/:token', middleware.addResponseLocals(), middleware.internalStopByToken.bind(middleware));

  Object.defineProperties(router, {
    engines: {
      value: middleware.engines,
      enumerable: true,
    },
    /** @type {TypedPropertyDescriptor<BpmnEngineMiddleware>} */
    middleware: {
      value: middleware,
      enumerable: true,
    },
  });

  return router;
}

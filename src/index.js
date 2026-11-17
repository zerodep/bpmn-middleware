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
 * @param {import('./interfaces.js').BpmnMiddlewareOptions} [options]
 * @returns {import('express').Router & { engines: Engines, middleware: BpmnEngineMiddleware }}
 */
export function bpmnEngineMiddleware(options) {
  const basePath = options?.basePath || '{*splat}';

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
  router.get(basePath + '/version', middleware.getVersion.bind(middleware));
  router.get(basePath + '/deployment', middleware.getDeployment.bind(middleware));
  router.post(basePath + '/deployment/create', multer({ storage }).any(), middleware.create.bind(middleware));
  router.post(basePath + '/process-definition/:deploymentName/start', middleware.start());
  router.get(basePath + '/v2/topology', middleware.getTopology.bind(middleware));
  router.post(basePath + '/v2/deployments', multer({ storage }).array('resources'), middleware.createDeployments.bind(middleware));
  router.post(basePath + '/v2/process-instances', middleware.startProcessInstance());
  router.get(basePath + '/processes/:processInstanceKey', middleware.redirectProcessInstance.bind(middleware));
  router.post(basePath + '/resume/:token', middleware.resume());
  router.post(basePath + '/signal/:token', middleware.signal());
  router.post(basePath + '/cancel/:token', middleware.cancel());
  router.post(basePath + '/fail/:token', middleware.fail());
  router.get(basePath + '/script/:deploymentName', middleware.preStart(), middleware.getScript.bind(middleware));
  router.get(basePath + '/timers/:deploymentName', middleware.preStart(), middleware.getDeploymentTimers.bind(middleware));
  router.get(basePath + '/running', middleware.addResponseLocals(), middleware.getRunning.bind(middleware));
  router.get(basePath + '/status/:token', middleware.addResponseLocals(), middleware.getStatusByToken.bind(middleware));
  router.get(basePath + '/status/:token/:activityId', middleware.addResponseLocals(), middleware.getActivityStatus.bind(middleware));
  router.get(basePath + '/state/:token', middleware.addResponseLocals(), middleware.getStateByToken.bind(middleware));
  router.delete(basePath + '/state/:token', json(), middleware.addResponseLocals(), middleware.deleteStateByToken.bind(middleware));
  router.delete(basePath + '/internal/stop', middleware.addResponseLocals(), middleware.internalStopAll.bind(middleware));
  router.delete(basePath + '/internal/stop/:token', middleware.addResponseLocals(), middleware.internalStopByToken.bind(middleware));

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

  return /** @type {import('express').Router & { engines: Engines, middleware: BpmnEngineMiddleware }} */ (router);
}

/** @typedef {import('./interfaces.js').BpmnMiddlewareOptions} BpmnMiddlewareOptions */
/** @typedef {import('./interfaces.js').ExecuteOptions} ExecuteOptions */
/** @typedef {import('./interfaces.js').StartDeploymentOptions} StartDeploymentOptions */
/** @typedef {import('./interfaces.js').StartDeploymentResult} StartDeploymentResult */
/** @typedef {import('./interfaces.js').MiddlewareEngineStatus} MiddlewareEngineStatus */
/** @typedef {import('./interfaces.js').MiddlewareEngineState} MiddlewareEngineState */
/** @typedef {import('./interfaces.js').SignalBody} SignalBody */
/** @typedef {import('./interfaces.js').IStorageAdapter} IStorageAdapter */
/** @typedef {import('./bpmn-middleware.js').StartDeployment} StartDeployment */
/** @typedef {import('./bpmn-middleware.js').TokenParameter} TokenParameter */
/** @typedef {import('./bpmn-middleware.js').BpmnMiddlewareResponseLocals} BpmnMiddlewareResponseLocals */

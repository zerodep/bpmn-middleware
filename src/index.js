import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Router, json } from 'express';
import multer from 'multer';

import { STORAGE_TYPE_DEPLOYMENT, STORAGE_TYPE_FILE, STORAGE_TYPE_STATE, DEFAULT_IDLE_TIMER } from './constants.js';
import { MulterAdapterStorage } from './MulterAdapterStorage.js';
import { Engines } from './Engines.js';
import { MemoryAdapter } from './MemoryAdapter.js';
import { HttpError, StorageError } from './Errors.js';
import { MiddlewareEngine } from './MiddlewareEngine.js';
import { fromActivityApi } from './Caller.js';

const nodeRequire = createRequire(fileURLToPath(import.meta.url));

const packageInfo = nodeRequire(join(process.cwd(), 'package.json'));
const kInitilialized = Symbol.for('initialized');

export { Engines, MemoryAdapter, HttpError, StorageError, MiddlewareEngine };
export * from './constants.js';

const snakeReplacePattern = /\W/g;

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
  router.post('(*)?/process-definition/:deploymentName/start', middleware.preStart(), middleware.start.bind(middleware));
  router.get('(*)?/script/:deploymentName', middleware.preStart(), middleware.getScript.bind(middleware));
  router.get('(*)?/timers/:deploymentName', middleware.preStart(), middleware.getDeploymentTimers.bind(middleware));
  router.get('(*)?/running', middleware.getRunning.bind(middleware));
  router.get('(*)?/status/:token', middleware.getStatusByToken.bind(middleware));
  router.get('(*)?/status/:token/:activityId', middleware._addEngineLocals, middleware.getActivityStatus.bind(middleware));
  router.post('(*)?/resume/:token', json(), middleware._addEngineLocals, middleware.resumeByToken.bind(middleware));
  router.post('(*)?/signal/:token', json(), middleware._addEngineLocals, middleware.signalActivity.bind(middleware));
  router.post('(*)?/cancel/:token', json(), middleware._addEngineLocals, middleware.cancelActivity.bind(middleware));
  router.post('(*)?/fail/:token', json(), middleware._addEngineLocals, middleware.failActivity.bind(middleware));
  router.get('(*)?/state/:token', middleware.getStateByToken.bind(middleware));
  router.delete('(*)?/state/:token', middleware.deleteStateByToken.bind(middleware));
  router.delete('(*)?/internal/stop', middleware.internalStopAll.bind(middleware));
  router.delete('(*)?/internal/stop/:token', middleware.internalStopByToken.bind(middleware));

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

/**
 * Bpmn Engine Middleware
 * @param {import('types').BpmnMiddlewareOptions} options
 * @param {Engines} engines
 */
export function BpmnEngineMiddleware(options, engines) {
  this.adapter = options.adapter;
  this.engines = engines;
  this.engineOptions = { ...options.engineOptions };
  this[kInitilialized] = false;

  /**
   * Bound addEngineLocals
   */
  this._addEngineLocals = this.addEngineLocals.bind(this);

  /**
   * Bound createEngine
   */
  this._createEngine = this.createEngine.bind(this);
}

/**
 * Initialize engine
 * @param {import('express').Request} req
 * @param {import('express').Response} _
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.init = function init(req, _, next) {
  if (this[kInitilialized]) return next();
  this[kInitilialized] = true;

  const app = req.app;
  app.locals.bpmnEngineListener = new BpmnPrefixListener(app);

  // @ts-ignore
  app.on('bpmn/end', (engine) => this._postProcessRun(engine));
  // @ts-ignore
  app.on('bpmn/error', (err, engine) => this._postProcessRun(engine, err));
  // @ts-ignore
  app.on('bpmn/activity.call', (callActivityApi) => this._startProcessByCallActivity(callActivityApi));
  // @ts-ignore
  app.on('bpmn/activity.call.cancel', (callActivityApi) => this._cancelProcessByCallActivity(callActivityApi));
  return next();
};

/**
 * Add middleware response locals
 * @param {import('express').Request} req
 * @param {import('express').Response<any, BpmnMiddlewareLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.addEngineLocals = function addEngineLocals(req, res, next) {
  res.locals.engines = res.locals.engines ?? this.engines;
  res.locals.adapter = res.locals.adapter ?? this.adapter;
  res.locals.listener = res.locals.listener ?? req.app.locals.bpmnEngineListener ?? new BpmnPrefixListener(req.app);
  next();
};

/**
 * Get package version
 * @param {import('express').Request} _
 * @param {import('express').Response<any, {version:string}>} res
 */
BpmnEngineMiddleware.prototype.getVersion = function getVersion(_, res) {
  return res.send({ version: packageInfo.version });
};

/**
 * Get deployment/package name
 * @param {import('express').Request} _
 * @param {import('express').Response<{name:string}>} res
 */
BpmnEngineMiddleware.prototype.getDeployment = function getDeployment(_, res) {
  return res.send({ name: packageInfo.name });
};

/**
 * Create deployment
 * @param {import('express').Request} req
 * @param {import('express').Response<CreateDeploymentResponseBody, BpmnMiddlewareLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.create = async function create(req, res, next) {
  try {
    if (!('deployment-name' in req.body)) throw new HttpError('deployment-name is required', 400);

    const deploymentName = req.body['deployment-name'];
    if (!req.files.length) throw new HttpError(`Cannot create deployment ${deploymentName} without files`, 400);

    await this.adapter.upsert(STORAGE_TYPE_DEPLOYMENT, deploymentName, req.files);

    return res.status(201).send({
      id: deploymentName,
      deploymentTime: new Date(),
      deployedProcessDefinitions: { [deploymentName]: { id: deploymentName } },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Pre start middleware
 * @returns {import('express').RequestHandler[]}
 */
BpmnEngineMiddleware.prototype.preStart = function preStart() {
  // @ts-ignore
  return [json(), this._addEngineLocals, this._createEngine];
};

/**
 * Start deployment
 * @param {import('express').Request<StartDeployment, {id:string}, >} _req
 * @param {import('express').Response<{id:string}, BpmnMiddlewareLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.start = async function start(_req, res, next) {
  try {
    const engine = res.locals.engine;
    await res.locals.engines.run(engine, res.locals.listener);
    return res.status(201).send({ id: engine.token });
  } catch (err) {
    next(err);
  }
};

/**
 * Start deployment
 * @param {import('express').Request<StartDeployment>} _req
 * @param {import('express').Response<string, BpmnMiddlewareLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.getScript = async function getScript(_req, res, next) {
  try {
    const engine = res.locals.engine;
    const [definition] = await engine.getDefinitions();

    let payload = `// ${engine.name} scripts `;
    for (const script of definition.context.definitionContext.getScripts()) {
      payload += `
// ${engine.name}/${script.name}
export function ${slugify(engine.name, script.name)}(excutionContext, next) {
  ${script.script.body.trim()}
}
      `;
    }

    res.set('content-type', 'text/javascript');
    return res.send(payload);
  } catch (err) {
    next(err);
  }
};

/**
 * Start deployment
 * @param {import('express').Request<StartDeployment>} _req
 * @param {import('express').Response<{timers:import('types').ParsedTimerResult[]}>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.getDeploymentTimers = async function getDeploymentTimers(_req, res, next) {
  try {
    const engine = res.locals.engine;
    const [definition] = await engine.getDefinitions();

    const contextTimers = definition.context.definitionContext.getTimers();
    /** @type {typeof import('bpmn-elements').TimerEventDefinition} */
    const TimerEventDefinition = engine.options.elements.TimerEventDefinition;

    /** @type {import('types').ParsedTimerResult[]} */
    const result = [];

    for (const timer of contextTimers) {
      const parsedTimer = { ...timer, success: true };
      result.push(parsedTimer);

      const element =
        timer.parent.type === 'bpmn:Process' ? definition.getProcessById(timer.parent.id) : definition.getActivityById(timer.parent.id);

      const { timerType, value } = timer.timer;

      try {
        // @ts-ignore
        const ted = new TimerEventDefinition(element, { [timerType]: value });

        // @ts-ignore
        const parsed = ted.parse(timerType, value);
        Object.assign(parsedTimer, parsed);
      } catch (/** @type {any} */ err) {
        parsedTimer.success = false;
        // @ts-ignore
        parsedTimer.message = err.message;
      }
    }

    return res.send({ timers: result });
  } catch (err) {
    next(err);
  }
};

/**
 * Get running engines
 * @param {import('express').Request<import('types').StorageQuery>} req
 * @param {import('express').Response<Awaited<ReturnType<Engines['getRunning']>>, BpmnMiddlewareLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.getRunning = async function getRunning(req, res, next) {
  try {
    const result = await this.engines.getRunning(req.query);
    return res.send(result);
  } catch (err) {
    next(err);
  }
};

/**
 * Get engine status by token
 * @param {import('express').Request<{token:string}>} req
 * @param {import('express').Response<Awaited<ReturnType<Engines['getStatusByToken']>>, BpmnMiddlewareLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.getStatusByToken = async function getStatusByToken(req, res, next) {
  try {
    const token = req.params.token;
    const status = await this.engines.getStatusByToken(token);
    if (!status) throw new HttpError(`Token ${token} not found`, 404);
    return res.send(status);
  } catch (err) {
    next(err);
  }
};

/**
 * Get engine activity status
 * @param {import('express').Request<{token:string;activityId:string}>} req
 * @param {import('express').Response<import('types').PostponedElement, BpmnMiddlewareLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.getActivityStatus = async function getActivityStatus(req, res, next) {
  try {
    const { token, activityId } = req.params;
    const postponed = await this.engines.getPostponed(token, res.locals.listener);
    const activity = postponed.find((p) => p.id === activityId);

    if (!activity) throw new HttpError(`Token ${token} has no running activity with id ${activityId}`, 400);

    res.send(activity);
  } catch (err) {
    next(err);
  }
};

/**
 * Signal activity
 * @param {import('express').Request<{token:string}, import('types').SignalBody>} req
 * @param {import('express').Response<ReturnType<Engines['getEngineStatusByToken']>, BpmnMiddlewareLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.signalActivity = async function signalActivity(req, res, next) {
  try {
    const token = req.params.token;
    await this.engines.signalActivity(token, res.locals.listener, req.body);
    return res.send(this.engines.getEngineStatusByToken(token));
  } catch (err) {
    next(err);
  }
};

/**
 * Cancel activity
 * @param {import('express').Request<{token:string}, import('types').SignalBody>} req
 * @param {import('express').Response<ReturnType<Engines['getEngineStatusByToken']>, BpmnMiddlewareLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.cancelActivity = async function cancelActivity(req, res, next) {
  try {
    const token = req.params.token;
    await this.engines.cancelActivity(token, res.locals.listener, req.body);
    return res.send(this.engines.getEngineStatusByToken(token));
  } catch (err) {
    next(err);
  }
};

/**
 * Fail activity
 * @param {import('express').Request<{token:string}, import('types').SignalBody>} req
 * @param {import('express').Response<ReturnType<Engines['getEngineStatusByToken']>, BpmnMiddlewareLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.failActivity = async function failActivity(req, res, next) {
  try {
    const token = req.params.token;
    await this.engines.failActivity(token, res.locals.listener, req.body);
    return res.send(this.engines.getEngineStatusByToken(token));
  } catch (err) {
    next(err);
  }
};

/**
 * Resume engine by token
 * @param {import('express').Request<{token:string}>} req
 * @param {import('express').Response<ReturnType<Engines['getEngineStatusByToken']>, BpmnMiddlewareLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.resumeByToken = async function resumeByToken(req, res, next) {
  try {
    const token = req.params.token;
    await this.engines.resume(token, res.locals.listener);
    return res.send(this.engines.getEngineStatusByToken(token));
  } catch (err) {
    next(err);
  }
};

/**
 * Get engine state by token
 * @param {import('express').Request<{token:string}>} req
 * @param {import('express').Response<Awaited<ReturnType<Engines['getStateByToken']>>, BpmnMiddlewareLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.getStateByToken = async function getStateByToken(req, res, next) {
  try {
    const token = req.params.token;
    const state = await this.engines.getStateByToken(token);
    if (!state) throw new HttpError(`State with token ${token} not found`, 404);
    return res.send(state);
  } catch (err) {
    next(err);
  }
};

/**
 * Delete engine by token
 * @param {import('express').Request<{token:string}>} req
 * @param {import('express').Response<void, BpmnMiddlewareLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.deleteStateByToken = async function deleteStateByToken(req, res, next) {
  try {
    const token = req.params.token;
    await this.engines.deleteByToken(token);
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
};

/**
 * Stop all running engines
 * @param {import('express').Request} _
 * @param {import('express').Response} res
 */
BpmnEngineMiddleware.prototype.internalStopAll = function internalStopAll(_, res) {
  this.engines.stopAll();
  return res.status(204).send();
};

/**
 * Stop engine by token
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
BpmnEngineMiddleware.prototype.internalStopByToken = function internalStopByToken(req, res) {
  const token = req.params.token;
  this.engines.stopByToken(token);
  return res.status(204).send();
};

/**
 * Internal create engine middleware
 * @internal
 * @param {import('express').Request<StartDeployment>} req
 * @param {import('express').Response<void, BpmnMiddlewareLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.createEngine = async function createEngine(req, res, next) {
  if (res.locals.engine) return next();

  try {
    const deploymentName = req.params.deploymentName;

    const deployment = await this.adapter.fetch(STORAGE_TYPE_DEPLOYMENT, deploymentName);
    if (!deployment) {
      throw new HttpError(`Deployment ${deploymentName} not found`, 404);
    }

    const { variables, businessKey, caller, idleTimeout } = req.body;
    const deploymentSource = await this.adapter.fetch(STORAGE_TYPE_FILE, deployment[0].path);

    const token = randomUUID();
    const engine = res.locals.engines.createEngine({
      ...this.engineOptions,
      name: deploymentName,
      token,
      source: deploymentSource.content,
      listener: res.locals.listener,
      variables: {
        ...this.engineOptions.variables,
        ...variables,
        ...(businessKey && { businessKey }),
      },
      idleTimeout,
      caller,
      businessKey,
    });

    res.locals.engine = engine;

    return next();
  } catch (err) {
    next(err);
  }
};

/**
 * Start process by call activity
 * @param {import('bpmn-elements').Api<import('bpmn-elements').Activity>} callActivityApi
 */
BpmnEngineMiddleware.prototype._startProcessByCallActivity = async function startProcessByCallActivity(callActivityApi) {
  const { owner: activity, content } = callActivityApi;
  const [category, ...rest] = content.calledElement.split(':');

  if (category !== STORAGE_TYPE_DEPLOYMENT || !rest.length) return;
  const deploymentName = rest.join(':');

  if (content.isRecovered) return;

  const caller = fromActivityApi(callActivityApi);

  try {
    return await this._startDeployment(deploymentName, {
      listener: activity.environment.options.listener,
      settings: { caller: { ...caller } },
      variables: { ...content.input },
      caller,
    });
  } catch (err) {
    // @ts-ignore
    callActivityApi.fail(err);
  }
};

/**
 * Internal start deployment
 * @internal
 * @param {string} deploymentName
 * @param {import('bpmn-engine').BpmnEngineOptions} options
 * @returns {Promise<{id:string}>} Started with id token
 */
BpmnEngineMiddleware.prototype._startDeployment = async function startDeployment(deploymentName, options) {
  const deployment = await this.adapter.fetch(STORAGE_TYPE_DEPLOYMENT, deploymentName);
  if (!deployment) {
    throw new HttpError(`deployment with name ${deploymentName} does not exist`, 404, 'BPMN_DEPLOYMENT_NOT_FOUND');
  }

  const deploymentSource = await this.adapter.fetch(STORAGE_TYPE_FILE, deployment[0].path);

  const { listener, variables, businessKey, caller, idleTimeout } = options;
  const token = randomUUID();
  await this.engines.execute({
    ...this.engineOptions,
    name: deploymentName,
    token,
    source: deploymentSource.content,
    listener,
    variables: {
      ...this.engineOptions.variables,
      ...variables,
      businessKey,
    },
    idleTimeout,
    caller,
    businessKey,
  });

  return { id: token };
};

/**
 * Cancel process by call activity
 * @param {import('bpmn-elements').Api<import('bpmn-elements').Activity>} callActivityApi
 */
BpmnEngineMiddleware.prototype._cancelProcessByCallActivity = async function cancelProcessByCallActivity(callActivityApi) {
  const [category, ...rest] = callActivityApi.content.calledElement.split(':');

  if (category !== STORAGE_TYPE_DEPLOYMENT || !rest.length) return;

  const caller = fromActivityApi(callActivityApi);

  const { records } = await this.adapter.query(STORAGE_TYPE_STATE, { state: 'running', caller });
  if (!records?.length) return;

  this.engines.discardByToken(records[0].token);
};

/**
 * Post process engine run
 * @param {MiddlewareEngine} engine
 * @param {Error} [error]
 */
BpmnEngineMiddleware.prototype._postProcessRun = async function postProcessRun(engine, error) {
  const { options, environment } = engine;
  try {
    if (options.caller?.token) {
      if (!error) {
        await this.engines.signalActivity(options.caller.token, options.listener, {
          ...options.caller,
          from: engine.token,
          message: environment.output,
        });
      } else {
        await this.engines.failActivity(options.caller.token, options.listener, {
          ...options.caller,
          fromToken: engine.token,
          message: error,
        });
      }
    }
  } catch (err) {
    options.listener.emit('warn', err);
  }
};

/**
 * Bpmn prefix listener
 * @param {import('express').Application} app Express app
 */
export function BpmnPrefixListener(app) {
  this.app = app;
}

/**
 * Emit event on Express app
 * @param {string} eventName
 * @param  {...any} args
 */
BpmnPrefixListener.prototype.emit = function emitBpmnEvent(eventName, ...args) {
  return this.app.emit(`bpmn/${eventName}`, ...args);
};

/**
 * Replace non-word characters with underscore
 * @param  {...string} args
 */
function slugify(...args) {
  const slugs = [];
  for (const arg of args) {
    slugs.push(arg.replace(snakeReplacePattern, '_'));
  }
  return slugs.join('_');
}

/**
 * BPMN middleware locals
 * @typedef {Object} BpmnMiddlewareLocals
 * @property {Engines} engines - Engine factory
 * @property {import('types').IStorageAdapter} adapter - Storage adapter
 * @property {BpmnPrefixListener} listener - Bpmn engine listener
 * @property {MiddlewareEngine} [engine] - Bpmn engine instance
 */

/**
 * Start deployment params
 * @typedef {Object} StartDeployment
 * @property {string} deploymentName - Deployment name
 */

/**
 * Create deployment result
 * @typedef {Object} CreateDeploymentResponseBody
 * @property {string} id - Deployment name
 * @property {Date} deploymentTime - Storage adapter
 * @property {any} deployedProcessDefinitions - Deployed process definitions
 */

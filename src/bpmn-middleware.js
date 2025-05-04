import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { json } from 'express';
import { Broker } from 'smqp';
import { ISODuration } from '@0dep/piso';

import { MIDDLEWARE_DEFAULT_EXCHANGE, STORAGE_TYPE_DEPLOYMENT, STORAGE_TYPE_FILE, STORAGE_TYPE_STATE } from './constants.js';
import { Engines } from './engines.js';
import { MemoryAdapter } from './memory-adapter.js';
import { HttpError, StorageError } from './errors.js';
import { MiddlewareEngine } from './middleware-engine.js';
import { createCallerFromActivityMessage } from './caller.js';
import debug from './debug.js';
import { DeferredCallback } from './deferred.js';

const nodeRequire = createRequire(fileURLToPath(import.meta.url));

const packageInfo = nodeRequire(join(process.cwd(), 'package.json'));
const kInitilialized = Symbol.for('initialized');

export { Engines, MemoryAdapter, HttpError, StorageError, MiddlewareEngine };
export * from './constants.js';

const snakeReplacePattern = /\W/g;

/**
 * Bpmn Engine Middleware
 * @param {import('types').BpmnMiddlewareOptions} options
 */
export function BpmnEngineMiddleware(options) {
  /** @type {string} BPMN Middleware name */
  const name = (this.name = options.name || MIDDLEWARE_DEFAULT_EXCHANGE);

  /** @type {import('types').IStorageAdapter} */
  const adapter = (this.adapter = options.adapter || new MemoryAdapter());

  /** @type {Broker} */
  const broker = (this.broker = options.broker || new Broker(this));

  this.engines = new Engines({ ...options, name, adapter, broker });
  this.engineOptions = { ...options.engineOptions };

  broker.assertExchange(name, 'topic', { autoDelete: false, durable: false });

  broker.subscribeTmp(name, 'activity.call', (_, msg) => this._startProcessByCallActivity(msg), { noAck: true });
  broker.subscribeTmp(name, 'activity.call.cancel', (_, msg) => this._cancelProcessByCallActivity(msg), { noAck: true });
  broker.subscribeTmp(name, 'definition.end', (_, msg) => this._postProcessDefinitionRun(msg), { noAck: true });
  broker.subscribeTmp(name, 'definition.error', (_, msg) => this._postProcessDefinitionRun(msg), { noAck: true });

  this[kInitilialized] = false;

  /**
   * Bound init
   */
  this._init = this.init.bind(this);

  /**
   * Bound addEngineLocals
   */
  this._addEngineLocals = this.addEngineLocals.bind(this);
}

/**
 * Initialize middleware
 * @type {import('connect').NextHandleFunction}
 * @param {import('express').Request} req
 */
BpmnEngineMiddleware.prototype.init = function init(req, _res, next) {
  if (this[kInitilialized]) return next();
  this[kInitilialized] = true;

  const app = req.app;
  this._bpmnEngineListener = new BpmnPrefixListener(app);

  app.on('bpmn/stop-all', () => this.engines.stopAll());

  return next();
};

/**
 * Start deployment request pipeline
 * @param {import('express').RequestHandler} [fn] start request handler
 * @returns {import('express').RequestHandler<StartDeployment, {id:string}, import('types').StartDeploymentOptions, import('types').ExecuteOptions>[]}
 */
BpmnEngineMiddleware.prototype.start = function start(fn) {
  // @ts-ignore
  return this.preStart().concat(fn ? this.startAndTrackEngine(fn) : this.runDeployment.bind(this));
};

/**
 * Resume engine request pipeline
 * @param {import('express').RequestHandler} [fn] resume request handler
 * @returns {import('express').RequestHandler<TokenParameter, ReturnType<Engines['getEngineStatusByToken']>, any, import('types').ExecuteOptions>[]}
 */
BpmnEngineMiddleware.prototype.resume = function resume(fn) {
  // @ts-ignore
  return this.preResume().concat(fn ? this.resumeAndTrackEngine(fn) : this.resumeByToken.bind(this));
};

/**
 * Signal activity request pipeline
 * @returns {import('express').RequestHandler<TokenParameter, ReturnType<Engines['getEngineStatusByToken']>, import('types').SignalBody, import('types').ExecuteOptions>[]}
 */
BpmnEngineMiddleware.prototype.signal = function signal() {
  // @ts-ignore
  return this.preResume().concat(this.signalActivity.bind(this));
};

/**
 * Cancel activity request pipeline
 * @returns {import('express').RequestHandler<TokenParameter, ReturnType<Engines['getEngineStatusByToken']>, import('types').SignalBody, import('types').ExecuteOptions>[]}
 */
BpmnEngineMiddleware.prototype.cancel = function cancel() {
  // @ts-ignore
  return this.preResume().concat(this.cancelActivity.bind(this));
};

/**
 * Fail activity request pipeline
 * @returns {import('express').RequestHandler<TokenParameter, ReturnType<Engines['getEngineStatusByToken']>, import('types').SignalBody, import('types').ExecuteOptions>[]}
 */
BpmnEngineMiddleware.prototype.fail = function fail() {
  // @ts-ignore
  return this.preResume().concat(this.failActivity.bind(this));
};

/**
 * Pre start BPMN engine execution middleware
 * @returns {import('connect').NextHandleFunction}
 */
BpmnEngineMiddleware.prototype.preStart = function preStart() {
  // @ts-ignore
  return [
    json(),
    ...this.addResponseLocals(),
    this._parseQueryToEngineOptions.bind(this),
    this._validateLocals.bind(this),
    this.createEngine.bind(this),
  ];
};

/**
 * Pre resume middleware
 * @type {import('connect').NextHandleFunction}
 */
BpmnEngineMiddleware.prototype.preResume = function preResume() {
  // @ts-ignore
  return [json(), ...this.addResponseLocals(), this._parseQueryToEngineOptions.bind(this), this._validateLocals.bind(this)];
};

/**
 * Add BPMN engine execution middleware response locals
 * @returns {import('connect').NextHandleFunction[]}
 */
BpmnEngineMiddleware.prototype.addResponseLocals = function addResponseLocals() {
  return [this._init, this._addEngineLocals];
};

/**
 * Add middleware response locals
 * @param {import('express').Request} _req
 * @param {import('express').Response<any, BpmnMiddlewareResponseLocals>} res
 * @param {import('express').NextFunction} next
 */

/**
 * Add middleware response locals
 * @type {import('connect').NextHandleFunction}
 * @param {import('express').Request<TokenParameter>} req
 * @param {import('express').Response<{id:string}, BpmnMiddlewareResponseLocals>} res
 */
BpmnEngineMiddleware.prototype.addEngineLocals = function addEngineLocals(req, res, next) {
  res.locals.middlewareName = this.name;
  res.locals.token = res.locals.token ?? req.params.token;
  const engines = (res.locals.engines = res.locals.engines ?? this.engines);
  res.locals.adapter = res.locals.adapter ?? engines.adapter;
  res.locals.broker = res.locals.broker ?? engines.broker;
  res.locals.listener = res.locals.listener ?? this._bpmnEngineListener;
  next();
};

/**
 * Get package version
 * @param {import('express').Request} _req
 * @param {import('express').Response<{version:string}, {version:string}>} res
 */
BpmnEngineMiddleware.prototype.getVersion = function getVersion(_req, res) {
  res.send({ version: packageInfo.version });
};

/**
 * Get deployment/package name
 * @param {import('express').Request} _req
 * @param {import('express').Response<{name:string}>} res
 */
BpmnEngineMiddleware.prototype.getDeployment = function getDeployment(_req, res) {
  res.send({ name: packageInfo.name });
};

/**
 * Create deployment
 * @param {import('express').Request} req
 * @param {import('express').Response<CreateDeploymentResponseBody, BpmnMiddlewareResponseLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.create = async function create(req, res, next) {
  try {
    if (!('deployment-name' in req.body)) throw new HttpError('deployment-name is required', 400);

    const deploymentName = req.body['deployment-name'];
    if (!req.files.length) throw new HttpError(`Cannot create deployment ${deploymentName} without files`, 400);

    await this.adapter.upsert(STORAGE_TYPE_DEPLOYMENT, deploymentName, req.files);

    res.status(201).send({
      id: deploymentName,
      deploymentTime: new Date(),
      deployedProcessDefinitions: { [deploymentName]: { id: deploymentName } },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Run deployment
 * @param {import('express').Request<StartDeployment, StartDeploymentResult, any, import('types').ExecuteOptions>} _req
 * @param {import('express').Response<StartDeploymentResult, BpmnMiddlewareResponseLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.runDeployment = async function run(_req, res, next) {
  try {
    const { engines, engine, listener } = res.locals;

    const sync = engine.sync;
    const ended = sync && new DeferredCallback(syncExecutionCallback);

    await engines.run(engine, listener, ended?.callback);

    if (!sync) return res.status(201).send({ id: engine.token });

    await ended;

    return res.status(200).send({ id: engine.token, result: engine.environment.output });
  } catch (err) {
    next(err);
  }
};

/**
 * Start deployment
 * @param {import('express').Request<StartDeployment>} _req
 * @param {import('express').Response<string, BpmnMiddlewareResponseLocals>} res
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
    res.send(payload);
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

    res.send({ timers: result });
  } catch (err) {
    next(err);
  }
};

/**
 * Get running engines
 * @param {import('express').Request<import('types').StorageQuery>} req
 * @param {import('express').Response<Awaited<ReturnType<Engines['getRunning']>>, BpmnMiddlewareResponseLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.getRunning = async function getRunning(req, res, next) {
  try {
    const result = await res.locals.engines.getRunning(req.query);
    res.send(result);
  } catch (err) {
    next(err);
  }
};

/**
 * Get engine status by token
 * @param {import('express').Request<TokenParameter>} req
 * @param {import('express').Response<Awaited<ReturnType<Engines['getStatusByToken']>>, BpmnMiddlewareResponseLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.getStatusByToken = async function getStatusByToken(req, res, next) {
  try {
    const token = req.params.token;
    const status = await res.locals.engines.getStatusByToken(token, req.query);
    if (!status) throw new HttpError(`Token ${token} not found`, 404);
    res.send(status);
  } catch (err) {
    next(err);
  }
};

/**
 * Get engine activity status
 * @param {import('express').Request<{token:string;activityId:string}>} req
 * @param {import('express').Response<import('types').PostponedElement, BpmnMiddlewareResponseLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.getActivityStatus = async function getActivityStatus(req, res, next) {
  try {
    const { token, activityId } = req.params;
    const postponed = await res.locals.engines.getPostponed(token, res.locals.listener);
    const activity = postponed.find((p) => p.id === activityId);

    if (!activity) throw new HttpError(`Token ${token} has no running activity with id ${activityId}`, 400);

    res.send(activity);
  } catch (err) {
    next(err);
  }
};

/**
 * Signal activity
 * @param {import('express').Request<TokenParameter, import('types').SignalBody, import('types').ExecuteOptions>} req
 * @param {import('express').Response<ReturnType<Engines['getEngineStatusByToken']>, BpmnMiddlewareResponseLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.signalActivity = async function signalActivity(req, res, next) {
  try {
    const { token, engines, listener, executeOptions } = res.locals;

    const sync = executeOptions.sync && new DeferredCallback(syncExecutionCallback);

    const engine = await engines.resumeAndSignalActivity(token, listener, req.body, executeOptions, sync?.callback);

    if (!sync) return res.send(engines.getEngineStatusByToken(token));

    await sync;

    res.send({ ...engines.getEngineStatus(engine), result: engine.environment.output });
  } catch (err) {
    next(err);
  }
};

/**
 * Cancel activity
 * @param {import('express').Request<TokenParameter, import('types').SignalBody>} req
 * @param {import('express').Response<ReturnType<Engines['getEngineStatusByToken']>, BpmnMiddlewareResponseLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.cancelActivity = async function cancelActivity(req, res, next) {
  try {
    const { token, engines, listener, executeOptions } = res.locals;

    const sync = executeOptions.sync && new DeferredCallback(syncExecutionCallback);

    const engine = await engines.resumeAndCancelActivity(token, listener, req.body, executeOptions, sync?.callback);

    if (!sync) return res.send(engines.getEngineStatusByToken(token));

    await sync;

    res.send({ ...engines.getEngineStatus(engine), result: engine.environment.output });
  } catch (err) {
    next(err);
  }
};

/**
 * Fail activity
 * @param {import('express').Request<TokenParameter, import('types').SignalBody>} req
 * @param {import('express').Response<ReturnType<Engines['getEngineStatusByToken']>, BpmnMiddlewareResponseLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.failActivity = async function failActivity(req, res, next) {
  try {
    const { token, engines, listener, executeOptions } = res.locals;
    await engines.resumeAndFailActivity(token, listener, req.body, executeOptions);
    res.send(engines.getEngineStatusByToken(token));
  } catch (err) {
    next(err);
  }
};

/**
 * Resume engine by token
 * @param {import('express').Request<TokenParameter, any, import('types').ExecuteOptions>} _req
 * @param {import('express').Response<ReturnType<Engines['getEngineStatusByToken']>, BpmnMiddlewareResponseLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.resumeByToken = async function resumeByToken(_req, res, next) {
  try {
    const { token, engines, listener, executeOptions } = res.locals;

    const sync = executeOptions.sync && new DeferredCallback(syncExecutionCallback);

    const engine = await engines.resume(token, listener, executeOptions, sync?.callback);

    if (!sync) {
      res.send(engines.getEngineStatusByToken(token));
      return;
    }

    await sync;

    res.send({ ...engines.getEngineStatus(engine), result: engine.environment.output });
  } catch (err) {
    next(err);
  }
};

/**
 * Get engine state by token
 * @param {import('express').Request<TokenParameter>} req
 * @param {import('express').Response<Awaited<ReturnType<Engines['getStateByToken']>>, BpmnMiddlewareResponseLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.getStateByToken = async function getStateByToken(req, res, next) {
  try {
    const token = req.params.token;
    const state = await res.locals.engines.getStateByToken(token);
    if (!state) throw new HttpError(`State with token ${token} not found`, 404);
    res.send(state);
  } catch (err) {
    next(err);
  }
};

/**
 * Delete engine by token
 * @param {import('express').Request<TokenParameter, void>} req
 * @param {import('express').Response<void, BpmnMiddlewareResponseLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.deleteStateByToken = async function deleteStateByToken(req, res, next) {
  try {
    const token = req.params.token;
    await res.locals.engines.deleteByToken(token, req.body);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
};

/**
 * @internal Stop all running engines
 * @param {import('express').Request} _
 * @param {import('express').Response} res
 */
BpmnEngineMiddleware.prototype.internalStopAll = function internalStopAll(_, res) {
  this.engines.stopAll();
  res.sendStatus(204);
};

/**
 * Stop engine by token
 * @internal
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
BpmnEngineMiddleware.prototype.internalStopByToken = function internalStopByToken(req, res) {
  const token = req.params.token;
  this.engines.stopByToken(token);
  res.sendStatus(204);
};

/**
 * Internal create engine middleware
 * @internal
 * @param {import('express').Request<StartDeployment, void, import('types').StartDeploymentOptions>} req
 * @param {import('express').Response<void, BpmnMiddlewareResponseLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype.createEngine = async function createEngine(req, res, next) {
  const { engine, engines, executeOptions } = res.locals;
  if (engine) return next();
  const token = (res.locals.token = res.locals.token || randomUUID());

  try {
    const deploymentName = req.params.deploymentName;

    const deployment = await this.adapter.fetch(STORAGE_TYPE_DEPLOYMENT, deploymentName);
    if (!deployment) {
      throw new HttpError(`Deployment ${deploymentName} not found`, 404);
    }

    const { variables, businessKey, caller, idleTimeout } = req.body || {};

    const deploymentSource = await this.adapter.fetch(STORAGE_TYPE_FILE, deployment[0].path);

    const engine = engines.createEngine({
      ...this.engineOptions,
      name: deploymentName,
      settings: { ...this.engineOptions.settings, ...executeOptions },
      token,
      source: deploymentSource.content,
      listener: res.locals.listener,
      variables: {
        ...this.engineOptions.variables,
        ...variables,
        ...(businessKey && { businessKey }),
      },
      idleTimeout: executeOptions.idleTimeout ?? idleTimeout,
      sync: executeOptions.sync,
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
 * @internal
 * @param {import('express').RequestHandler} fn
 */
BpmnEngineMiddleware.prototype.startAndTrackEngine = function startAndTrackEngine(fn) {
  /**
   * Internal start engine middleware
   * @internal
   * @param {import('express').Request<StartDeployment, void, import('types').StartDeploymentOptions>} req
   * @param {import('express').Response<void, BpmnMiddlewareResponseLocals>} res
   * @param {import('express').NextFunction} next
   */
  return async function startAndTrackEngineMiddleware(req, res, next) {
    try {
      const { engines, engine, listener } = res.locals;
      await engines.run(engine, listener);
      fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };
};

/**
 * @internal
 * @param {import('express').RequestHandler} fn
 */
BpmnEngineMiddleware.prototype.resumeAndTrackEngine = function resumeAndTrackEngine(fn) {
  /**
   * Internal resume engine middleware
   * @internal
   * @param {import('express').Request<StartDeployment, void, import('types').ExecuteOptions>} req
   * @param {import('express').Response<void, BpmnMiddlewareResponseLocals>} res
   * @param {import('express').NextFunction} next
   */
  return async function resumeAndTrackEngineMiddleware(req, res, next) {
    try {
      const { token, engines, listener, executeOptions } = res.locals;
      res.locals.engine = await engines.resume(token, listener, executeOptions);
      fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Internal validate response locals
 * @internal
 * @param {import('connect').IncomingMessage} _req
 * @param {import('express').Response<void, BpmnMiddlewareResponseLocals>} res
 * @param {import('express').NextFunction} next
 */

/**
 * @type {import('connect').NextHandleFunction}
 * @param {import('express').Response<void, BpmnMiddlewareResponseLocals>} res
 */
BpmnEngineMiddleware.prototype._validateLocals = function validateLocals(_req, res, next) {
  /** @type {BpmnMiddlewareResponseLocals} */
  const { token, engine } = res.locals;

  if (token && typeof token !== 'string') {
    debug('res.locals.token is not a string, resetting');
    res.locals.token = null;
  }

  if (engine && !(engine instanceof MiddlewareEngine)) {
    debug(`res.locals.engine is not an instance of ${MiddlewareEngine.name}, resetting`);
    res.locals.engine = null;
  }

  next();
};

/**
 * Internal get engine run options from query
 * @internal
 * @param {import('express').Request<any, any, import('types').ExecuteOptions>} req
 * @param {import('express').Response<ReturnType<Engines['getEngineStatusByToken']>, BpmnMiddlewareResponseLocals>} res
 * @param {import('express').NextFunction} next
 */
BpmnEngineMiddleware.prototype._parseQueryToEngineOptions = function parseQueryToEngineOptions(req, res, next) {
  /** @type {import('types').ExecuteOptions} */
  const options = (res.locals.executeOptions = {});

  let current;
  try {
    for (const [k, v] of Object.entries(req.query)) {
      current = k;

      switch (k.toLowerCase()) {
        case 'autosaveenginestate': {
          options.autosaveEngineState = v === 'false' ? false : true;
          break;
        }
        case 'sync': {
          options.sync = v === 'false' ? false : true;
          break;
        }
        case 'idletimeout': {
          if (!v) break;
          let ms = Number(v);
          if (isNaN(ms)) {
            ms = new ISODuration(v.toString()).parse().toMilliseconds();
          } else if (ms < 0) {
            throw new TypeError('must be a positive number');
          }

          options.idleTimeout = ms;
          break;
        }
        default: {
          options[k] = v;
        }
      }
    }

    if (options.sync && !options.idleTimeout) {
      options.idleTimeout = 60000;
    }

    next();
  } catch (err) {
    // @ts-ignore
    return next(new HttpError(`${current}: ${err.message}`, 400));
  }
};

/**
 * Start process by call activity
 * @internal
 * @param {import('smqp').Message} callActivityMessage
 */
BpmnEngineMiddleware.prototype._startProcessByCallActivity = async function startProcessByCallActivity(callActivityMessage) {
  try {
    const content = callActivityMessage.content;

    const [category, ...rest] = content.calledElement.split(':');

    if (category !== STORAGE_TYPE_DEPLOYMENT || !rest.length) return;

    // eslint-disable-next-line no-var
    var deploymentName = rest.join(':');

    if (content.isRecovered) return;

    // eslint-disable-next-line no-var
    var caller = createCallerFromActivityMessage(callActivityMessage);

    return await this._startDeployment(deploymentName, {
      listener: this._bpmnEngineListener,
      settings: { ...content.settings, caller: { ...caller } },
      variables: { ...content.input },
      caller,
    });
  } catch (err) {
    // eslint-disable-next-line no-var
    var error = err;
    debug(`failed to start ${deploymentName} by call activity ${caller?.executionId}`, err);
  }

  try {
    return await this.engines.resumeAndFailActivity(caller.token, this._bpmnEngineListener, {
      ...caller,
      message: error,
    });
  } catch (err) {
    debug(`failed to fail call activity ${caller?.executionId}`, err);
    this._bpmnEngineListener.emit('warn', err);
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
  const deployment = await this.adapter.fetch(STORAGE_TYPE_DEPLOYMENT, deploymentName, options);
  if (!deployment) {
    throw new HttpError(`deployment with name ${deploymentName} does not exist`, 404, 'BPMN_DEPLOYMENT_NOT_FOUND');
  }

  const deploymentSource = await this.adapter.fetch(STORAGE_TYPE_FILE, deployment[0].path, options);

  const { listener, settings, variables, businessKey, caller, idleTimeout } = options;

  const token = randomUUID();

  await this.engines.execute({
    ...this.engineOptions,
    name: deploymentName,
    token,
    source: deploymentSource.content,
    listener,
    settings: {
      ...this.engineOptions.settings,
      ...settings,
    },
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
 * @internal
 * @param {import('smqp').Message} callActivityMessage
 */
BpmnEngineMiddleware.prototype._cancelProcessByCallActivity = async function cancelProcessByCallActivity(callActivityMessage) {
  const [category, ...rest] = callActivityMessage.content.calledElement.split(':');

  if (category !== STORAGE_TYPE_DEPLOYMENT || !rest.length) return;

  const deploymentName = rest.join(':');

  try {
    // eslint-disable-next-line no-var
    var caller = createCallerFromActivityMessage(callActivityMessage);

    const saveEngineStateOptions = callActivityMessage.content.settings?.saveEngineStateOptions;

    const { records } = await this.adapter.query(STORAGE_TYPE_STATE, { state: 'running', caller }, saveEngineStateOptions);

    if (!records?.length) {
      return debug(`cancel called process ignored, found no running process with token ${caller.token}`);
    }

    debug(`discard ${deploymentName} token ${records[0].token} by call activity ${caller?.executionId}`);

    await this.engines.discardByToken(records[0].token, this._bpmnEngineListener, { ...saveEngineStateOptions, resumedBy: caller.token });
  } catch (err) {
    debug(`failed to discard ${deploymentName} token ${caller.token} by call activity ${caller?.executionId}`, err);
    this._bpmnEngineListener.emit('warn', err);
  }
};

/**
 * Post process engine definition run
 * @internal
 * @param {import('smqp').MessageMessage} definitionEndMessage
 */
BpmnEngineMiddleware.prototype._postProcessDefinitionRun = async function postProcessDefinitionRun(definitionEndMessage) {
  const { fields, content, properties } = definitionEndMessage;
  const { caller, resumedBy, settings } = content;
  if (!caller) return;

  try {
    if (resumedBy === caller.token && !this.engines.getByToken(resumedBy)) {
      return debug(
        `process ${properties.deployment} (${properties.token}), resumed by ${caller.deployment} (${caller.token}), has already completed`
      );
    }

    if (fields.routingKey === 'definition.error') {
      await this.engines.resumeAndFailActivity(
        caller.token,
        this._bpmnEngineListener,
        {
          ...caller,
          fromToken: properties.token,
          message: content.error,
        },
        settings?.saveEngineStateOptions
      );
    } else {
      await this.engines.resumeAndSignalActivity(
        caller.token,
        this._bpmnEngineListener,
        {
          ...caller,
          fromToken: properties.token,
          message: content.output,
        },
        settings?.saveEngineStateOptions
      );
    }
  } catch (err) {
    debug(
      `failed to post process ${properties.deployment} token ${properties.token} addressing ${caller.deployment} (${caller.token})`,
      err
    );
    this._bpmnEngineListener.emit('warn', err);
  }
};

/**
 * Bpmn prefix listener
 * @param {import('express').Application} app Express app
 */
function BpmnPrefixListener(app) {
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

function syncExecutionCallback() {}

/**
 * Middleware response locals
 * @typedef {Object} BpmnMiddlewareResponseLocals
 * @property {string} middlewareName - Middleware name
 * @property {Engines} engines - Engine factory
 * @property {import('types').IStorageAdapter} adapter - Storage adapter
 * @property {Broker} broker - Middleware broker
 * @property {BpmnPrefixListener} listener - BPMN engine listener
 * @property {string} [token] - BPMN engine execution token
 * @property {MiddlewareEngine} [engine] - BPMN engine instance
 * @property {import('types').ExecuteOptions} [executeOptions] - BPMN engine execution options
 */

/**
 * Start deployment params
 * @typedef {Object} StartDeployment
 * @property {string} deploymentName - Deployment name
 */

/**
 * Start deployment result
 * @typedef {Object} StartDeploymentResult
 * @property {string} id - engine run token
 * @property {any} [result] - engine.environment.output as result
 */

/**
 * Token params
 * @typedef {Object} TokenParameter
 * @property {string} token - BPMN engine execution token
 */

/**
 * Create deployment result
 * @typedef {Object} CreateDeploymentResponseBody
 * @property {string} id - Deployment name
 * @property {Date} deploymentTime - Deployed at date
 * @property {any} deployedProcessDefinitions - Deployed process definitions
 */

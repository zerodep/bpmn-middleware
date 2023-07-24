import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Router, json } from 'express';
import fs from 'node:fs';
import multer from 'multer';
import YAML from 'yaml'

import { STORAGE_TYPE_DEPLOYMENT, STORAGE_TYPE_FILE, STORAGE_TYPE_STATE, DEFAULT_IDLE_TIMER } from './constants.js';
import { MulterAdapterStorage } from './MulterAdapterStorage.js';
import { Engines } from './Engines.js';
import { MemoryAdapter } from './MemoryAdapter.js';
import { HttpError } from './Errors.js';
import { MiddlewareEngine } from './MiddlewareEngine.js';
import { fromActivityApi } from './Caller.js';
import swaggerUi from "swagger-ui-express";

const packageInfo = fs.promises.readFile(join(process.cwd(), 'package.json')).then((content) => JSON.parse(content));
const kInitilialized = Symbol.for('initialized');

export { Engines, MemoryAdapter, HttpError, MiddlewareEngine };
export * from './constants.js';

export function bpmnEngineMiddleware(options) {
  const adapter = options?.adapter || new MemoryAdapter();
  const engines = new Engines({
    adapter,
    engineOptions: { ...options?.engineOptions },
    engineCache: options?.engineCache,
    broker: options?.broker,
    idleTimeout: options?.idleTimeout ?? DEFAULT_IDLE_TIMER,
  });

  const storage = new MulterAdapterStorage(adapter);
  const middleware = new BpmnEngineMiddleware({ adapter, engines });

  const router = new Router({ mergeParams: true });

  let initialized = false;

  router.use((req, res, next) => {
    if (initialized) return next();
    initialized = true;
    return middleware.init(req, res, next);
  });
  router.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(null, { explorer: true, swaggerUrl: '../openapi.json' })
  );
  var swaggerUiDoc = {}
  packageInfo.then(p => {
    let swaggerInfo = fs.readFileSync(join(process.cwd(), 'src/openapi.yml')).toString();
    swaggerUiDoc = YAML.parse(swaggerInfo)
    swaggerUiDoc.info.version = p.version
    swaggerUiDoc.info.title = p.name
    swaggerUiDoc.info.description = p.description
    swaggerUiDoc.info.license.name = p.license
  });
  router.get('(*)?/openapi.json', (req, res) => { res.send(swaggerUiDoc) })
  router.get('(*)?/version', middleware.getVersion);
  router.get('(*)?/deployment', middleware.getDeployment);
  router.post('(*)?/deployment/create', multer({ storage }).any(), middleware.create);
  router.post('(*)?/process-definition/:deploymentName/start', json(), middleware.addEngineLocals, middleware.start);
  router.get('(*)?/running', middleware.getRunning);
  router.get('(*)?/status/:token', middleware.getStatusByToken);
  router.get('(*)?/status/:token/:activityId', middleware.addEngineLocals, middleware.getActivityStatus);
  router.post('(*)?/resume/:token', json(), middleware.addEngineLocals, middleware.resumeByToken);
  router.post('(*)?/signal/:token', json(), middleware.addEngineLocals, middleware.signalActivity);
  router.post('(*)?/cancel/:token', json(), middleware.addEngineLocals, middleware.cancelActivity);
  router.post('(*)?/fail/:token', json(), middleware.addEngineLocals, middleware.failActivity);
  router.get('(*)?/state/:token', middleware.getStateByToken);
  router.delete('(*)?/state/:token', middleware.deleteStateByToken);
  router.delete('(*)?/internal/stop', middleware.internalStopAll);
  router.delete('(*)?/internal/stop/:token', middleware.internalStopByToken);

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

export function BpmnEngineMiddleware(options) {
  this.adapter = options.adapter;
  this.engines = options.engines;
  this.engineOptions = { ...options.engineOptions };
  this[kInitilialized] = false;

  this.getVersion = this.getVersion.bind(this);
  this.getDeployment = this.getDeployment.bind(this);
  this.create = this.create.bind(this);
  this.addEngineLocals = this.addEngineLocals.bind(this);
  this.start = this.start.bind(this);
  this.cancelActivity = this.cancelActivity.bind(this);
  this.deleteStateByToken = this.deleteStateByToken.bind(this);
  this.failActivity = this.failActivity.bind(this);
  this.getActivityStatus = this.getActivityStatus.bind(this);
  this.getRunning = this.getRunning.bind(this);
  this.getStateByToken = this.getStateByToken.bind(this);
  this.getStatusByToken = this.getStatusByToken.bind(this);
  this.resumeByToken = this.resumeByToken.bind(this);
  this.signalActivity = this.signalActivity.bind(this);
  this.internalStopAll = this.internalStopAll.bind(this);
  this.internalStopByToken = this.internalStopByToken.bind(this);
}

BpmnEngineMiddleware.prototype.init = function init(req, res, next) {
  if (this[kInitilialized]) return next();
  this[kInitilialized] = true;

  const app = req.app;
  app.locals.bpmnEngineListener = new BpmnPrefixListener(app);

  app.on('bpmn/end', (engine) => this._postProcessRun(engine));
  app.on('bpmn/error', (err, engine) => this._postProcessRun(engine, err));
  app.on('bpmn/activity.call', (callActivityApi) => this._startProcessByCallActivity(callActivityApi));
  app.on('bpmn/activity.call.cancel', (callActivityApi) => this._cancelProcessByCallActivity(callActivityApi));
  return next();
};

BpmnEngineMiddleware.prototype.addEngineLocals = function addEngineLocals(req, res, next) {
  res.locals.engines = this.engines;
  res.locals.adapter = this.adapter;
  res.locals.listener = req.app.locals.bpmnEngineListener ?? new BpmnPrefixListener(req.app);
  next();
};

BpmnEngineMiddleware.prototype.getVersion = async function getVersion(req, res) {
  return res.send({ version: (await packageInfo).version });
};

BpmnEngineMiddleware.prototype.getDeployment = async function getDeployment(req, res) {
  return res.send({ name: (await packageInfo).name });
};

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

BpmnEngineMiddleware.prototype.start = async function start(req, res, next) {
  try {
    const deploymentName = req.params.deploymentName;

    const result = await this._startDeployment(deploymentName, {
      listener: res.locals.listener,
      variables: req.body?.variables,
      businessKey: req.body?.businessKey,
      idleTimeout: req.body?.idleTimeout,
    });

    if (!result) throw new HttpError(`Deployment ${deploymentName} not found`, 404);

    return res.status(201).send(result);
  } catch (err) {
    next(err);
  }
};

BpmnEngineMiddleware.prototype.getRunning = async function getRunning(req, res, next) {
  try {
    const result = await this.engines.getRunning(req.query);
    return res.send(result);
  } catch (err) {
    next(err);
  }
};

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

BpmnEngineMiddleware.prototype.signalActivity = async function signalActivity(req, res, next) {
  try {
    const token = req.params.token;
    await this.engines.signalActivity(token, res.locals.listener, req.body);
    return res.send(this.engines.getEngineStatusByToken(token));
  } catch (err) {
    next(err);
  }
};

BpmnEngineMiddleware.prototype.cancelActivity = async function cancelActivity(req, res, next) {
  try {
    const token = req.params.token;
    await this.engines.cancelActivity(token, res.locals.listener, req.body);
    return res.send(this.engines.getEngineStatusByToken(token));
  } catch (err) {
    next(err);
  }
};

BpmnEngineMiddleware.prototype.failActivity = async function failActivity(req, res, next) {
  try {
    const token = req.params.token;
    await this.engines.failActivity(token, res.locals.listener, req.body);
    return res.send(this.engines.getEngineStatusByToken(token));
  } catch (err) {
    next(err);
  }
};

BpmnEngineMiddleware.prototype.resumeByToken = async function resumeByToken(req, res, next) {
  try {
    const token = req.params.token;
    await this.engines.resume(token, res.locals.listener);
    return res.send(this.engines.getEngineStatusByToken(token));
  } catch (err) {
    next(err);
  }
};

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

BpmnEngineMiddleware.prototype.deleteStateByToken = async function deleteStateByToken(req, res, next) {
  try {
    const token = req.params.token;
    await this.engines.deleteByToken(token);
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
};

BpmnEngineMiddleware.prototype.internalStopAll = function internalStopAll(req, res) {
  this.engines.stopAll();
  return res.status(204).send();
};

BpmnEngineMiddleware.prototype.internalStopByToken = function internalStopByToken(req, res) {
  const token = req.params.token;
  this.engines.stopByToken(token);
  return res.status(204).send();
};

BpmnEngineMiddleware.prototype._startDeployment = async function startDeployment(deploymentName, options) {
  const deployment = await this.adapter.fetch(STORAGE_TYPE_DEPLOYMENT, deploymentName);
  if (!deployment) return;

  const { listener, variables, businessKey, caller, idleTimeout } = options;
  const deploymentSource = await this.adapter.fetch(STORAGE_TYPE_FILE, deployment[0].path);

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
  });

  return { id: token };
};

BpmnEngineMiddleware.prototype._startProcessByCallActivity = function startProcessByCallActivity(callActivityApi) {
  const { owner: activity, content } = callActivityApi;
  const [category, ...rest] = content.calledElement.split(':');

  if (category !== STORAGE_TYPE_DEPLOYMENT || !rest.length) return;
  const deploymentName = rest.join(':');

  if (content.isRecovered) return;

  const caller = fromActivityApi(callActivityApi);

  return this._startDeployment(deploymentName, {
    listener: activity.environment.options.listener,
    settings: { caller: { ...caller } },
    variables: { ...content.input },
    caller,
  });
};

BpmnEngineMiddleware.prototype._cancelProcessByCallActivity = async function cancelProcessByCallActivity(callActivityApi) {
  const [category, ...rest] = callActivityApi.content.calledElement.split(':');

  if (category !== STORAGE_TYPE_DEPLOYMENT || !rest.length) return;

  const caller = fromActivityApi(callActivityApi);

  const { records } = await this.adapter.query(STORAGE_TYPE_STATE, { state: 'running', caller });
  if (!records?.length) return;

  this.engines.discardByToken(records[0].token);
};

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

export function BpmnPrefixListener(app) {
  this.app = app;
}

BpmnPrefixListener.prototype.emit = function emitBpmnEvent(eventName, ...args) {
  return this.app.emit(`bpmn/${eventName}`, ...args);
};

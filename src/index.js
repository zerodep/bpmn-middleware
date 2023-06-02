import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Router, json } from 'express';
import fs from 'node:fs';
import multer from 'multer';

import { STORAGE_TYPE_DEPLOYMENT, STORAGE_TYPE_FILE, STORAGE_TYPE_STATE, DEFAULT_IDLE_TIMER } from './constants.js';
import { MulterAdapterStorage } from './MulterAdapterStorage.js';
import { Engines } from './Engines.js';
import { MemoryAdapter } from './MemoryAdapter.js';
import { HttpError } from './Errors.js';
import { MiddlewareEngine } from './MiddlewareEngine.js';
import { fromActivityApi } from './Caller.js';

const packageInfo = fs.promises.readFile(join(process.cwd(), 'package.json')).then((content) => JSON.parse(content));

const kInitialized = Symbol.for('adapter init');

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
  const engineMiddleware = new BpmnEngineMiddleware({ adapter, engines });

  const router = new Router({ mergeParams: true });

  const middleware = [
    router.use(engineMiddleware.init),
    router.get('(*)?/version', engineMiddleware.getVersion),
    router.get('(*)?/deployment', engineMiddleware.getDeployment),
    router.post('(*)?/deployment/create', multer({ storage }).any(), engineMiddleware.create),
    router.post('(*)?/process-definition/:deploymentName/start', json(), engineMiddleware.start),
    router.get('(*)?/running', engineMiddleware.getRunning),
    router.get('(*)?/status/:token', engineMiddleware.getStatusByToken),
    router.get('(*)?/status/:token/:activityId', engineMiddleware.getActivityStatus),
    router.post('(*)?/resume/:token', json(), engineMiddleware.resumeByToken),
    router.post('(*)?/signal/:token', json(), engineMiddleware.signalActivity),
    router.post('(*)?/cancel/:token', json(), engineMiddleware.cancelActivity),
    router.post('(*)?/fail/:token', json(), engineMiddleware.failActivity),
    router.get('(*)?/state/:token', engineMiddleware.getStateByToken),
    router.delete('(*)?/state/:token', engineMiddleware.deleteStateByToken),
    router.delete('(*)?/internal/stop', engineMiddleware.internalStopAll),
    router.delete('(*)?/internal/stop/:token', engineMiddleware.internalStopByToken),
  ];

  Object.defineProperties(middleware, { engines: { value: engines } });

  return middleware;
}

export function BpmnEngineMiddleware(options) {
  this.adapter = options.adapter;
  this.engines = options.engines;
  this.engineOptions = { ...options.engineOptions };
  this[kInitialized] = false;

  this.init = this.init.bind(this);
  this.getVersion = this.getVersion.bind(this);
  this.getDeployment = this.getDeployment.bind(this);
  this.create = this.create.bind(this);
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
  if (this[kInitialized]) return next();
  this[kInitialized] = true;
  req.app.on('bpmn/end', (engine) => this._postProcessRun(engine));
  req.app.on('bpmn/error', (err, engine) => this._postProcessRun(engine, err));
  req.app.on('bpmn/activity.call', (callActivityApi) => this._startProcessByCallActivity(callActivityApi));
  req.app.on('bpmn/activity.call.cancel', (callActivityApi) => this._cancelProcessByCallActivity(callActivityApi));
  return next();
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
      listener: new ForwardListener(req.app),
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
    const { records, ...rest } = await this.adapter.query(STORAGE_TYPE_STATE, { ...req.query, state: 'running' });
    return res.send({ engines: records.map(getStatusFromEngineState), ...rest });
  } catch (err) {
    next(err);
  }
};

BpmnEngineMiddleware.prototype.getStatusByToken = async function getStatusByToken(req, res, next) {
  try {
    const token = req.params.token;
    const state = await this.adapter.fetch(STORAGE_TYPE_STATE, token);
    if (!state) throw new HttpError(`Token ${token} not found`, 404);
    return res.send(getStatusFromEngineState(state));
  } catch (err) {
    next(err);
  }
};

BpmnEngineMiddleware.prototype.getActivityStatus = async function getActivityStatus(req, res, next) {
  try {
    const { token, activityId } = req.params;
    const postponed = await this.engines.getPostponed(token, new ForwardListener(req.app));
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
    await this.engines.signalActivity(token, new ForwardListener(req.app), req.body);
    return res.send(this.engines.getEngineStatusByToken(token));
  } catch (err) {
    next(err);
  }
};

BpmnEngineMiddleware.prototype.cancelActivity = async function cancelActivity(req, res, next) {
  try {
    const token = req.params.token;
    await this.engines.cancelActivity(token, new ForwardListener(req.app), req.body);
    return res.send(this.engines.getEngineStatusByToken(token));
  } catch (err) {
    next(err);
  }
};

BpmnEngineMiddleware.prototype.failActivity = async function failActivity(req, res, next) {
  try {
    const token = req.params.token;
    await this.engines.failActivity(token, new ForwardListener(req.app), req.body);
    return res.send(this.engines.getEngineStatusByToken(token));
  } catch (err) {
    next(err);
  }
};

BpmnEngineMiddleware.prototype.resumeByToken = async function resumeByToken(req, res, next) {
  try {
    const token = req.params.token;
    await this.engines.resume(token, new ForwardListener(req.app));
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

  const token = randomUUID();
  await this.engines.execute({
    ...this.engineOptions,
    name: deploymentName,
    token,
    source: (await this.adapter.fetch(STORAGE_TYPE_FILE, deployment[0].path)),
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
  const [ category, ...rest ] = content.calledElement.split(':');

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
  const [ category, ...rest ] = callActivityApi.content.calledElement.split(':');

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

function ForwardListener(app) {
  this.app = app;
}

ForwardListener.prototype.emit = function emitBpmnEvent(eventName, ...args) {
  return this.app.emit(`bpmn/${eventName}`, ...args);
};

function getStatusFromEngineState(state) {
  return {
    token: state.token,
    name: state.name,
    state: state.state,
    activityStatus: state.activityStatus,
    sequenceNumber: state.sequenceNumber,
    postponed: state.postponed,
    caller: state.caller,
    expireAt: state.expireAt,
  };
}

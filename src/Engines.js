import { LRUCache } from 'lru-cache';

import { MiddlewareEngine } from './MiddlewareEngine.js';
import { STORAGE_TYPE_STATE } from './constants.js';
import { HttpError } from './Errors.js';

/**
 * Engines class
 * @param {import('types').BpmnMiddlewareOptions} options
 */
export function Engines(options) {
  this.broker = options.broker;
  this.engineOptions = options.engineOptions;
  this.idleTimeout = options.idleTimeout;
  this.adapter = options.adapter;
  this.engineCache = options.engineCache || new LRUCache({ max: 1000 });

  // @ts-ignore
  this.__onStateMessage = this._onStateMessage.bind(this);
}

/**
 * Execute engine
 * @param {import('types').MiddlewareEngineOptions} executeOptions
 */
Engines.prototype.execute = async function execute(executeOptions) {
  const { token } = executeOptions;

  try {
    const engine = this.createEngine(executeOptions);
    this.engineCache.set(token, engine);

    this._setupEngine(engine);

    await engine.execute();

    if (engine.state === 'running') {
      engine.startIdleTimer();
      engine.broker.publish('event', 'engine.start', {});
    }

    return engine;
  } catch (err) {
    this.terminateByToken(token);
    throw err;
  }
};

/**
 * Resume engine execution
 * @param {string} token
 * @param {import('bpmn-engine').IListenerEmitter} [listener]
 * @returns {Promise<MiddlewareEngine>}
 */
Engines.prototype.resume = async function resume(token, listener) {
  try {
    const engineCache = this.engineCache;

    /** @type {MiddlewareEngine} */
    let engine = engineCache.get(token);
    const state = await this.adapter.fetch(STORAGE_TYPE_STATE, token);

    if (!state && !engine) {
      throw new HttpError(`Token ${token} not found`, 404);
    }

    if (state?.state === 'idle') {
      throw new HttpError(`Token ${token} has already completed`, 400);
    }

    // @ts-ignore
    if (state?.sequenceNumber > engine?.options.sequenceNumber) {
      this.terminateByToken(token);
      return this.resume(token, listener);
    }

    if (engine) return engine;

    // @ts-ignore
    engine = new MiddlewareEngine(token, {
      listener,
      ...this.engineOptions,
      token,
    }).recover(state.engine);

    engine.options.token = token;
    engine.options.caller = state.caller;
    engine.options.sequenceNumber = state.sequenceNumber;
    engine.options.expireAt = state.expireAt;

    this.engineCache.set(token, engine);

    this._setupEngine(engine);

    await engine.resume();
    engine.startIdleTimer();

    return engine;
  } catch (err) {
    this.terminateByToken(token);
    throw err;
  }
};

/**
 * Signal activity
 * @param {string} token
 * @param {import('bpmn-engine').IListenerEmitter} listener
 * @param {import('types').SignalBody} body
 */
Engines.prototype.signalActivity = async function signalActivity(token, listener, body) {
  const engine = await this.resume(token, listener);

  engine.execution.signal(body);

  return engine;
};

/**
 * Cancel activity
 * @param {string} token
 * @param {import('bpmn-engine').IListenerEmitter} listener
 * @param {import('types').SignalBody} body
 */
Engines.prototype.cancelActivity = async function cancelActivity(token, listener, body) {
  const engine = await this.resume(token, listener);
  const api = this._getActivityApi(engine, body);
  api.cancel();
  return engine;
};

/**
 * Fail activity
 * @param {string} token
 * @param {import('bpmn-engine').IListenerEmitter} listener
 * @param {import('types').SignalBody} body
 */
Engines.prototype.failActivity = async function failActivity(token, listener, body) {
  const engine = await this.resume(token, listener);
  const api = this._getActivityApi(engine, body);
  api.sendApiMessage('error', body, { type: 'error' });
  return engine;
};

/**
 * Get postponed activities by token
 * @param {string} token
 * @param {import('bpmn-engine').IListenerEmitter} listener
 * @returns {Promise<import('types').PostponedElement[]>}
 */
Engines.prototype.getPostponed = async function getPostponed(token, listener) {
  const engine = await this.resume(token, listener);

  const postponed = engine.execution.getPostponed();

  return postponed.map((api) => {
    return {
      token,
      ...api.content,
      executing: api.getExecuting()?.map((e) => ({ ...e.content })),
    };
  });
};

/**
 * Get engine state by token
 * @param {string} token
 * @param {any} options
 * @returns {Promise<import('types').MiddlewareEngineState>}
 */
Engines.prototype.getStateByToken = function getStateByToken(token, options) {
  return this.adapter.fetch(STORAGE_TYPE_STATE, token, options);
};

/**
 * Get engine status by token
 * @param {string} token
 * @returns {Promise<import('types').MiddlewareEngineStatus>}
 */
Engines.prototype.getStatusByToken = function getStatusByToken(token) {
  return this.getStateByToken(token, { exclude: ['engine'] });
};

/**
 * Get running engines by query
 * @param {any} [query]
 * @returns {Promise<import('types').MiddlewareEngineState>}
 */
Engines.prototype.getRunning = async function getRunning(query) {
  const { records, ...rest } = await this.adapter.query(STORAGE_TYPE_STATE, { ...query, state: 'running', exclude: ['engine'] });
  // @ts-ignore
  return { engines: records, ...rest };
};

/**
 * Discards engine by token
 * @param {string} [token]
 */
Engines.prototype.discardByToken = async function discardByToken(token) {
  const engine = await this.resume(token);

  const definitions = engine.execution?.definitions;
  for (const definition of definitions) {
    for (const bp of definition.getRunningProcesses()) {
      bp.getApi().discard();
    }
  }
};

/**
 * Delete and stop engine by token
 * @param {string} token
 */
Engines.prototype.deleteByToken = function deleteByToken(token) {
  this.terminateByToken(token);
  return this.adapter.delete(STORAGE_TYPE_STATE, token);
};

/**
 * Stop engine by token
 * @param {string} token
 */
Engines.prototype.stopByToken = function stopByToken(token) {
  const engine = this.engineCache.get(token);
  if (!engine) return;
  engine.stop();
};

/**
 * Stop all running engines
 */
Engines.prototype.stopAll = function stopAll() {
  for (const token of [...this.engineCache.keys()]) {
    this.stopByToken(token);
  }
};

/**
 * Terminate engine by token
 * @param {string} token
 */
Engines.prototype.terminateByToken = function terminateByToken(token) {
  const engine = this.engineCache.get(token);
  if (!engine) return false;
  this._teardownEngine(engine);
  engine.stop();
  return true;
};

/**
 * Create middleware bpmn engine
 * @param {import('types').MiddlewareEngineOptions} executeOptions
 */
Engines.prototype.createEngine = function createEngine(executeOptions) {
  const { name, token, source, listener, variables, caller, settings, idleTimeout } = executeOptions;
  return new MiddlewareEngine(token, {
    ...this.engineOptions,
    name,
    source,
    listener,
    settings: {
      ...this.engineOptions?.settings,
      idleTimeout,
      ...settings,
    },
    variables: {
      ...this.engineOptions?.variables,
      ...variables,
      token,
    },
    token,
    sequenceNumber: 0,
    caller,
  });
};

/**
 * Get running engine status by token
 * @param {string} token
 */
Engines.prototype.getEngineStatusByToken = function getEngineStatusByToken(token) {
  const engine = this.engineCache.get(token);
  if (!engine) return;
  return this.getEngineStatus(engine);
};

/**
 * Get engine status
 * @param {MiddlewareEngine} engine
 * @returns {import('types').MiddlewareEngineStatus}
 */
Engines.prototype.getEngineStatus = function getEngineStatus(engine) {
  /** @type {import('types').MiddlewareEngineStatus} */
  const result = {
    token: engine.token,
    name: engine.name,
    state: engine.state,
    activityStatus: engine.activityStatus,
    sequenceNumber: engine.options.sequenceNumber,
    postponed: [],
    caller: engine.options.caller,
  };

  if (!engine.execution) return result;

  for (const elm of engine.execution.getPostponed()) {
    result.postponed.push({ id: elm.id, type: elm.type });
  }

  const expireAt = engine.expireAt;
  if (expireAt) result.expireAt = expireAt;

  return result;
};

/**
 * Internal setup engine listeners
 * @param {MiddlewareEngine} engine
 */
Engines.prototype._setupEngine = function setupEngine(engine) {
  const parentBroker = this.broker;
  const engineBroker = engine.broker;
  const engineOptions = engine.options;

  engineOptions.sequenceNumber = engineOptions.sequenceNumber ?? 0;

  if (parentBroker) {
    parentBroker.assertExchange('event', 'topic', { durable: false, autoDelete: false });
    engineBroker.createShovel(
      'app-shovel',
      { exchange: 'event' },
      {
        broker: parentBroker,
        exchange: 'event',
        publishProperties: {
          token: engineOptions.token,
          deployment: engine.name,
        },
      },
    );
  }

  engineBroker.subscribeTmp(
    'event',
    'activity.#',
    (routingKey, message) => {
      if (routingKey === 'activity.stop') return;
      else if (message.fields.redelivered) return;
      else if (message.content.isRecovered) return;
      engineOptions.sequenceNumber++;
    },
    { noAck: true, consumerTag: 'sequence-listener' },
  );

  engineBroker.assertExchange('state', 'topic', { durable: false, autoDelete: false });
  engineBroker.bindExchange('event', 'state', 'activity.wait');
  engineBroker.bindExchange('event', 'state', 'activity.call');
  engineBroker.bindExchange('event', 'state', 'activity.timer');
  engineBroker.bindExchange('event', 'state', 'activity.timeout');
  engineBroker.bindExchange('event', 'state', 'activity.end');
  engineBroker.bindExchange('event', 'state', 'engine.start');
  engineBroker.bindExchange('event', 'state', 'engine.idle.timer');
  engineBroker.bindExchange('event', 'state', 'engine.end');
  engineBroker.bindExchange('event', 'state', 'engine.stop');
  engineBroker.bindExchange('event', 'state', 'engine.error');

  engineBroker.assertQueue('state-q', { durable: false, autoDelete: false, maxLength: 2 });
  engineBroker.bindQueue('state-q', 'state', '#');

  engineBroker.consume('state-q', this.__onStateMessage, { consumerTag: 'state-listener' });
};

/**
 * Internal on state message
 * @param {string} routingKey
 * @param {import('smqp').Message} message
 * @param {MiddlewareEngine} engine
 */
Engines.prototype._onStateMessage = async function onStateMessage(routingKey, message, engine) {
  if (message.content.isRecovered) return message.ack();

  const engineOptions = engine.options;

  try {
    switch (routingKey) {
      case 'engine.end':
        this._teardownEngine(engine);
        engineOptions.expireAt = undefined;
        engineOptions.listener.emit(message.properties.type, engine);
        break;
      case 'engine.stop':
        this._teardownEngine(engine);
        engineOptions.listener.emit(message.properties.type, engine);
        break;
      case 'engine.error':
        this._teardownEngine(engine);
        engineOptions.expireAt = undefined;
        engineOptions.listener.emit('error', message.content, engine);
        break;
      case 'activity.timer': {
        if (message.content.expireAt) {
          const currentExpireAt = (engineOptions.expireAt = engine.expireAt);
          const contentExpireAt = new Date(message.content.expireAt);
          if (!currentExpireAt || contentExpireAt < currentExpireAt) engineOptions.expireAt = contentExpireAt;
        }
        break;
      }
      default:
        engineOptions.expireAt = engine.expireAt;
        break;
    }

    await this._saveEngineState(engine);
  } catch (err) {
    this._teardownEngine(engine);
    engine.stop();
    return engineOptions.listener?.emit('error', err, engine);
  }

  message.ack();
};

/**
 * Internal save engine state
 * @param {MiddlewareEngine} engine
 */
Engines.prototype._saveEngineState = async function saveEngineState(engine) {
  const { token, expireAt, sequenceNumber, caller } = engine.options;
  /** @type {import('types').MiddlewareEngineState} */
  const state = {
    token,
    name: engine.name,
    expireAt,
    sequenceNumber,
    ...(caller && { caller }),
  };

  /** @type {import('types').postponed[]} */
  const postponed = (state.postponed = []);
  for (const elm of engine.execution.getPostponed()) {
    postponed.push({ id: elm.id, type: elm.type });
  }

  if (!engine.stopped) {
    state.activityStatus = engine.activityStatus;
    state.state = engine.state;
  }

  state.engine = engine.execution.getState();

  await this.adapter.upsert(STORAGE_TYPE_STATE, token, state);
};

/**
 * Internal teardown engine, remove listeners and stuff
 * @param {MiddlewareEngine} engine
 */
Engines.prototype._teardownEngine = function teardownEngine(engine) {
  const broker = engine.broker;
  this.engineCache.delete(engine.token);
  broker.cancel('sequence-listener');
  broker.cancel('state-listener');
  broker.closeShovel('app-shovel');
};

/**
 * Internal get activity
 * @param {MiddlewareEngine} engine
 * @param {import('types').SignalBody} body
 */
Engines.prototype._getActivityApi = function getActivityApi(engine, body) {
  const { id, executionId } = body;

  // @ts-ignore
  const activity = engine.execution.getActivityById(id);
  if (!activity) throw new HttpError(`Token ${engine.token} has no activity with id ${id}`, 400);

  // @ts-ignore
  if (executionId) return activity.getApi({ content: { id, executionId } });

  // @ts-ignore
  if (!activity.isRunning) {
    throw new HttpError(`Token ${engine.token} has no running activity with id ${id}`, 400);
  }

  // @ts-ignore
  return activity.getApi();
};

import { randomUUID } from 'node:crypto';
import { LRUCache } from 'lru-cache';

import { MiddlewareEngine } from './middleware-engine.js';
import { HttpError } from './errors.js';
import {
  STORAGE_TYPE_STATE,
  SAVE_STATE_ROUTINGKEY,
  ENABLE_SAVE_STATE_ROUTINGKEY,
  DISABLE_SAVE_STATE_ROUTINGKEY,
  ERR_STORAGE_KEY_NOT_FOUND,
  DEFAULT_IDLE_TIMER,
  ERR_COMPLETED,
} from './constants.js';
import debug from './debug.js';

const kOptions = Symbol.for('options');

/**
 * Engines class
 * @param {import('types').BpmnMiddlewareOptions} options
 */
export function Engines(options) {
  if (!options?.name || typeof options.name !== 'string') throw new TypeError('options.name is mandatory and must be a string');
  if (!options.adapter) throw new TypeError('options.adapter is mandatory');
  if (!options.broker) throw new TypeError('options.broker is mandatory');

  const passedOptions = (this[kOptions] = {
    ...options,
    idleTimeout: options.idleTimeout || DEFAULT_IDLE_TIMER,
    engineCache:
      options.engineCache ||
      new LRUCache({
        max: options.maxRunning || 1000,
        disposeAfter: onEvictEngine,
      }),
  });

  this.engineOptions = passedOptions.engineOptions;
  this.idleTimeout = passedOptions.idleTimeout;

  /** @type {LRUCache<string, MiddlewareEngine, unknown>} */
  // @ts-ignore
  this.engineCache = passedOptions.engineCache;

  this.autosaveEngineState = passedOptions.autosaveEngineState;
  this.Scripts = passedOptions.Scripts;
  this.Services = passedOptions.Services;

  /** @internal Bound state message handler */
  this.__onStateMessage = this._onStateMessage.bind(this);
}

/** @name module:bpmn-middleware.Engines#name */
Object.defineProperty(Engines.prototype, 'name', {
  /** @returns {string} */
  get() {
    return this[kOptions].name;
  },
});

/** @name module:bpmn-middleware.Engines#broker */
Object.defineProperty(Engines.prototype, 'broker', {
  /** @returns {import('smqp').Broker} */
  get() {
    return this[kOptions].broker;
  },
});

/** @name module:bpmn-middleware.Engines#adapter */
Object.defineProperty(Engines.prototype, 'adapter', {
  /** @returns {import('types').IStorageAdapter} */
  get() {
    return this[kOptions].adapter;
  },
});

/** @name module:bpmn-middleware.Engines#running */
Object.defineProperty(Engines.prototype, 'running', {
  /** @returns {MiddlewareEngine[]} */
  get() {
    return [...this.engineCache.values()];
  },
});

/**
 * Clone engines instance
 * @param {Partial<import('types').BpmnMiddlewareOptions>} [overrideOptions]
 * @returns {Engines}
 */
Engines.prototype.clone = function cloneEnginesInstance(overrideOptions) {
  // @ts-ignore
  return new this.constructor({ ...this[kOptions], ...overrideOptions });
};

/**
 * Create and execute engine from options
 * @param {import('types').MiddlewareEngineOptions} executeOptions
 */
Engines.prototype.execute = function execute(executeOptions) {
  const token = executeOptions.token ?? randomUUID();
  const engine = this.createEngine({ ...executeOptions, token });
  return this.run(engine, executeOptions.listener);
};

/**
 * Run prepared engine
 * @param {MiddlewareEngine} engine
 * @param {import('bpmn-engine').IListenerEmitter} [listener]
 * @param {(err: Error, engine: import('bpmn-engine').Execution)=>void} [callback]
 */
Engines.prototype.run = async function runEngine(engine, listener, callback) {
  const token = engine.token;
  this.engineCache.set(token, engine);
  this._setupEngine(engine);

  try {
    await engine.execute({ listener }, callback);

    if (engine.state === 'running') {
      engine.startIdleTimer(callback && publishRunTimeoutError);
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
 * @param {import('types').ExecuteOptions} [options]
 * @param {(err: Error, engine: import('bpmn-engine').Execution)=>void} [callback] resume run completed callback
 * @returns {Promise<MiddlewareEngine>}
 */
Engines.prototype.resume = async function resume(token, listener, options, callback) {
  try {
    const engineCache = this.engineCache;
    /** @type {import('types').ExecuteOptions} */
    const resumeOptions = { ...options };

    /** @type {MiddlewareEngine} */
    let engine = engineCache.get(token);
    /** @type {import('types').MiddlewareEngineState} */
    let state = await this.adapter.fetch(STORAGE_TYPE_STATE, token, options);

    if (!state && !engine) {
      throw new HttpError(`Token ${token} not found`, 404);
    } else if (state?.state === 'idle') {
      throw new HttpError(`Token ${token} has already completed`, 400, ERR_COMPLETED);
    } else if (state?.state === 'error') {
      throw new HttpError(`Token ${token} has failed`, 400, ERR_COMPLETED);
    }

    // @ts-ignore
    if (state?.sequenceNumber > engine?.options.sequenceNumber) {
      this.terminateByToken(token);
      return this.resume(token, listener, options, callback);
    }

    if (engine) {
      if ('autosaveEngineState' in resumeOptions) {
        engine.environment.settings.autosaveEngineState = resumeOptions.autosaveEngineState;
      }
      if ('sync' in resumeOptions) {
        engine.sync = resumeOptions.sync;
      }
      if (resumeOptions.resumedBy) {
        engine.options.resumedBy = resumeOptions.resumedBy;
      }

      if (callback) {
        state = this.createEngineState(engine);
        this.terminateByToken(token);
      } else {
        return engine;
      }
    }

    // @ts-ignore
    engine = new MiddlewareEngine(token, {
      listener,
      ...this.engineOptions,
      token,
      ...(this.Scripts && { scripts: this.Scripts(this.adapter, state.name, state.businessKey) }),
      ...('sync' in resumeOptions && { sync: resumeOptions.sync }),
    }).recover(state.engine);

    this.engineCache.set(token, engine);

    engine.options.token = token;
    engine.options.caller = state.caller;
    engine.options.sequenceNumber = state.sequenceNumber;
    engine.options.expireAt = state.expireAt;
    engine.options.businessKey = state.businessKey;
    if (resumeOptions.resumedBy) {
      engine.options.resumedBy = resumeOptions.resumedBy;
    }

    if ('autosaveEngineState' in resumeOptions) {
      engine.environment.settings.autosaveEngineState = resumeOptions.autosaveEngineState;
    }

    this._setupEngine(engine);

    await engine.resume(null, callback);

    engine.startIdleTimer(
      callback &&
        ((e) => {
          this._teardownEngine(e);
          publishRunTimeoutError(e);
        }),
      resumeOptions.idleTimeout
    );

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
 * @param {import('types').ExecuteOptions} [options]
 * @param {(err: Error, engine: import('bpmn-engine').Execution)=>void} [callback]
 */
Engines.prototype.resumeAndSignalActivity = async function resumeAndSignalActivity(token, listener, body, options, callback) {
  const engine = await this.resume(token, listener, options, callback);

  await new Promise((resolve) => {
    process.nextTick(() => {
      engine.execution.signal(body);
      resolve();
    });
  });

  return engine;
};

/**
 * Cancel activity
 * @param {string} token
 * @param {import('bpmn-engine').IListenerEmitter} listener
 * @param {import('types').SignalBody} body
 * @param {import('types').ExecuteOptions} [options]
 * @param {(err: Error, engine: import('bpmn-engine').Execution)=>void} [callback]
 */
Engines.prototype.resumeAndCancelActivity = async function cancelActivity(token, listener, body, options, callback) {
  const engine = await this.resume(token, listener, options, callback);

  const activtyApi = getActivityApi(engine, body);

  if (activtyApi.type === 'bpmn:CallActivity') {
    activtyApi.cancel(body);
  } else {
    engine.execution?.cancelActivity(body);
  }
  return engine;
};

/**
 * Resume and fail activity
 * @param {string} token
 * @param {import('bpmn-engine').IListenerEmitter} listener
 * @param {import('types').SignalBody} body
 * @param {import('types').ExecuteOptions} [options]
 */
Engines.prototype.resumeAndFailActivity = async function resumeAndFailActivity(token, listener, body, options) {
  const engine = await this.resume(token, listener, options);
  const api = getActivityApi(engine, body);
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
 * @param {any} [options] adapter fetch options
 * @returns {Promise<import('types').MiddlewareEngineState>}
 */
Engines.prototype.getStateByToken = function getStateByToken(token, options) {
  return this.adapter.fetch(STORAGE_TYPE_STATE, token, options);
};

/**
 * Get engine status by token
 * @param {string} token
 * @param {any} [options] adapter fetch options
 * @returns {Promise<import('types').MiddlewareEngineStatus>}
 */
Engines.prototype.getStatusByToken = function getStatusByToken(token, options) {
  return this.getStateByToken(token, { exclude: ['engine'], ...options });
};

/**
 * Get running engines by querying storage
 * @param {any} [query]
 * @returns {Promise<import('types').MiddlewareEngineState[]>}
 */
Engines.prototype.getRunning = async function getRunning(query) {
  const { records, ...rest } = await this.adapter.query(STORAGE_TYPE_STATE, { ...query, state: 'running', exclude: ['engine'] });
  // @ts-ignore
  return { engines: records, ...rest };
};

/**
 * Discards engine by token
 * @param {string} [token]
 * @param {import('bpmn-engine').IListenerEmitter} [listener]
 * @param {any} [options] resume options
 */
Engines.prototype.discardByToken = async function discardByToken(token, listener, options) {
  const engine = await this.resume(token, listener, options);

  const definitions = engine.execution?.definitions;
  for (const definition of definitions) {
    for (const bp of definition.getRunningProcesses()) {
      bp.getApi().discard();
    }
  }
};

/**
 * Get running engine by token
 * @param {string} token
 * @returns {MiddlewareEngine|undefined}
 */
Engines.prototype.getByToken = function getByToken(token) {
  return this.engineCache.get(token);
};

/**
 * Delete engine state and stop engine by token
 * @param {string} token
 * @param {any} [options]
 */
Engines.prototype.deleteByToken = function deleteByToken(token, options) {
  this.terminateByToken(token);
  return this.adapter.delete(STORAGE_TYPE_STATE, token, options);
};

/**
 * Stop engine by token
 * @param {string} token
 */
Engines.prototype.stopByToken = function stopByToken(token) {
  const engine = this.getByToken(token);
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
  const { name, token, source, listener, variables, caller, settings, idleTimeout, businessKey, sync } = executeOptions;

  return new MiddlewareEngine(token, {
    ...this.engineOptions,
    name,
    source,
    listener,
    settings: {
      autosaveEngineState: this.autosaveEngineState,
      ...this.engineOptions?.settings,
      idleTimeout,
      ...settings,
    },
    variables: {
      ...this.engineOptions?.variables,
      ...variables,
      token,
    },
    services: {
      ...this.engineOptions?.services,
    },
    token,
    sequenceNumber: 0,
    sync,
    caller,
    businessKey,
    ...(this.Scripts && { scripts: this.Scripts(this.adapter, name, businessKey) }),
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
 * Create engine state
 * @param {MiddlewareEngine} engine
 */
Engines.prototype.createEngineState = function createEngineState(engine) {
  const token = engine.token;
  const { expireAt, sequenceNumber, caller, businessKey } = engine.options;

  /** @type {import('types').MiddlewareEngineState} */
  const state = {
    token,
    name: engine.name,
    expireAt,
    sequenceNumber,
    ...(businessKey && { businessKey }),
    ...(caller && { caller }),
  };

  /** @type {import('types').postponed[]} */
  const postponed = (state.postponed = []);
  for (const elmApi of engine.execution.getPostponed()) {
    postponed.push({ id: elmApi.id, type: elmApi.type });

    if (elmApi.content.isSubProcess) {
      for (const subElmApi of elmApi.getPostponed()) {
        if (subElmApi.id === elmApi.id) continue;
        postponed.push({ id: subElmApi.id, type: subElmApi.type });
      }
    }
  }

  if (!engine.stopped) {
    state.activityStatus = engine.activityStatus;
    state.state = engine.state;
  }

  state.engine = engine.execution.getState();

  return state;
};

/**
 * Save engine state
 * @param {MiddlewareEngine} engine
 * @param {boolean} [ifExists] save engine state if existing state
 * @param {any} [options] adapter store options
 */
Engines.prototype.saveEngineState = async function saveEngineState(engine, ifExists, options) {
  const state = this.createEngineState(engine);

  if (ifExists) {
    try {
      await this.adapter.update(STORAGE_TYPE_STATE, state.token, state, options);
    } catch (err) {
      // @ts-ignore
      if (err.code === ERR_STORAGE_KEY_NOT_FOUND) return;
      throw err;
    }
  } else {
    await this.adapter.upsert(STORAGE_TYPE_STATE, state.token, state, options);
  }
};

/**
 * @internal
 * Internal setup engine listeners
 * @param {MiddlewareEngine} engine
 */
Engines.prototype._setupEngine = function setupEngine(engine) {
  const parentBroker = this.broker;
  const engineBroker = engine.broker;
  const engineOptions = engine.options;

  engineOptions.sequenceNumber = engineOptions.sequenceNumber ?? 0;

  engine.environment.addService('saveState', saveState);
  engine.environment.addService('enableSaveState', enableSaveState);
  engine.environment.addService('disableSaveState', disableSaveState);

  let addServices;
  if (this.Services && (addServices = this.Services.call(engine.environment, this.adapter, engine.name, engine.options.businessKey))) {
    for (const [k, fn] of Object.entries(addServices)) {
      engine.environment.addService(k, fn);
    }
  }

  if (parentBroker) {
    parentBroker.assertExchange(this.name, 'topic', { durable: false, autoDelete: false });
    engineBroker.createShovel(
      'app-shovel',
      { exchange: 'event' },
      {
        broker: parentBroker,
        exchange: this.name,
        publishProperties: {
          token: engineOptions.token,
          deployment: engine.name,
        },
      },
      {
        cloneMessage: cloneShovelMessage(engine),
      }
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
    { noAck: true, consumerTag: 'sequence-listener' }
  );

  engineBroker.assertExchange('state', 'topic', { durable: false, autoDelete: true });

  engineBroker.bindExchange('event', 'state', SAVE_STATE_ROUTINGKEY);
  engineBroker.bindExchange('event', 'state', ENABLE_SAVE_STATE_ROUTINGKEY);
  engineBroker.bindExchange('event', 'state', DISABLE_SAVE_STATE_ROUTINGKEY);
  engineBroker.bindExchange('event', 'state', 'activity.end');
  engineBroker.bindExchange('event', 'state', 'activity.wait');
  engineBroker.bindExchange('event', 'state', 'activity.timer');
  engineBroker.bindExchange('event', 'state', 'activity.timeout');
  engineBroker.bindExchange('event', 'state', 'activity.call');
  engineBroker.bindExchange('event', 'state', 'engine.start');
  engineBroker.bindExchange('event', 'state', 'engine.idle.timer');
  engineBroker.bindExchange('event', 'state', 'engine.end');
  engineBroker.bindExchange('event', 'state', 'engine.stop');
  engineBroker.bindExchange('event', 'state', 'engine.error');

  engineBroker.assertQueue('state-q', { durable: false, autoDelete: true, maxLength: 2 });
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

  const engineSettings = engine.environment.settings;
  const engineOptions = engine.options;
  /** @type {boolean} */
  const autosaveEngineState = engineSettings.autosaveEngineState;

  let saveState = autosaveEngineState;
  let saveStateIfExists = false;
  const saveStateOptions = { ...engineSettings.saveEngineStateOptions };

  try {
    switch (routingKey) {
      case SAVE_STATE_ROUTINGKEY: {
        saveState = true;
        Object.assign(saveStateOptions, message.content);
        break;
      }
      case ENABLE_SAVE_STATE_ROUTINGKEY: {
        engineSettings.autosaveEngineState = true;
        engineSettings.saveEngineStateOptions = Object.assign(engineSettings.saveEngineStateOptions || {}, message.content);
        saveState = false;
        break;
      }
      case DISABLE_SAVE_STATE_ROUTINGKEY: {
        engine.environment.settings.autosaveEngineState = false;
        saveState = false;
        break;
      }
      case 'engine.end':
        this._teardownEngine(engine);
        engineOptions.expireAt = undefined;
        engineOptions.listener?.emit(message.properties.type, engine);
        break;
      case 'engine.stop':
        this._teardownEngine(engine);
        engineOptions.listener?.emit(message.properties.type, engine);
        break;
      case 'engine.error': {
        this._teardownEngine(engine);
        engineOptions.expireAt = undefined;
        engineOptions.listener?.emit('error', message.content, engine);
        saveState = true;
        saveStateIfExists = true;
        break;
      }
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

    if (saveState) {
      await this.saveEngineState(engine, saveStateIfExists, saveStateOptions);
    }
  } catch (err) {
    engine.broker.cancel('state-listener');
    engine.broker.publish('event', 'engine.error', err, { type: 'error' });
    this._teardownEngine(engine);
    engine.stop();
    debug(`failed to save ${engine.name} ${engine.token} state`, err);
    engineOptions.listener?.emit('error', err, engine);
  }

  message.ack();
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
function getActivityApi(engine, body) {
  const { id, executionId } = body;

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
}

/**
 * LRU cache disposeAfter function
 * @param {import('bpmn-engine').Engine} engine
 * @param {string} _key
 * @param {LRUCache.DisposeReason} reason
 */
export function onEvictEngine(engine, _key, reason) {
  if (reason === 'evict') {
    engine.stop();
  }
}

/**
 * Save state service function
 * @this import('bpmn-elements').Activity
 * @param {any[]} args
 */
function saveState(...args) {
  const callback = args.pop();
  const message = args.pop();

  if (!message?.content?.isRecovered) {
    this.broker.publish('event', SAVE_STATE_ROUTINGKEY, { ...args.shift() });
  }

  callback(null, true);
}

/**
 * Enable auto-save state service function
 * @this import('bpmn-elements').Activity
 * @param {any[]} args
 */
function enableSaveState(...args) {
  const callback = args.pop();
  const message = args.pop();

  if (!message?.content?.isRecovered) {
    this.broker.publish('event', ENABLE_SAVE_STATE_ROUTINGKEY, { ...args.shift() });
  }

  callback(null, true);
}

/**
 * Enable auto-save state service function
 * @this import('bpmn-elements').Activity
 * @param {any[]} args
 */
function disableSaveState(...args) {
  const callback = args.pop();
  const message = args.pop();

  if (!message?.content?.isRecovered) {
    this.broker.publish('event', DISABLE_SAVE_STATE_ROUTINGKEY, { ...args.shift() });
  }

  callback(null, true);
}

/**
 * Clone shovel message
 * @param {MiddlewareEngine} engine
 */
function cloneShovelMessage(engine) {
  /** @type {(message: import('smqp').MessageMessage) => import('bpmn-elements').ElementBrokerMessage} */
  return function cloneMessage(msg) {
    const { fields, content, properties } = msg;
    switch (fields.routingKey) {
      case 'definition.end':
      case 'definition.error': {
        const { caller, resumedBy } = engine.options;
        if (caller) {
          content.caller = { ...caller };
        }
        if (resumedBy) {
          content.resumedBy = resumedBy;
        }
      }
      case 'activity.call':
      case 'activity.call.cancel': {
        if (engine.environment.settings.saveEngineStateOptions) {
          content.settings = { saveEngineStateOptions: { ...engine.environment.settings.saveEngineStateOptions }, ...content.settings };
        }
        break;
      }
    }

    return { fields, content, properties };
  };
}

/**
 * Publish run timeout error to stop engine
 * @param {MiddlewareEngine} engine
 */
function publishRunTimeoutError(engine) {
  engine.execution.definitions[0].broker.publish(
    'event',
    'definition.error',
    { error: new HttpError('run timed out', 504) },
    { mandatory: true }
  );
}

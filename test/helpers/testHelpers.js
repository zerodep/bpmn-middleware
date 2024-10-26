import { randomInt } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

import FormData from 'form-data';
import { extensions, extendFn, OnifySequenceFlow, OnifyTimerEventDefinition } from '@onify/flow-extensions';
import * as bpmnElements from 'bpmn-elements';
import express from 'express';
import request from 'supertest';
import { Broker } from 'smqp';
import { LRUCache } from 'lru-cache';

import { bpmnEngineMiddleware } from '../../src/index.js';
import { HttpError } from '../../src/Errors.js';
import { MemoryAdapter } from '../../src/MemoryAdapter.js';
import debug from '../../src/debug.js';

const nodeRequire = createRequire(import.meta.url);

const camunda = nodeRequire('camunda-bpmn-moddle/resources/camunda.json');

const elements = {
  ...bpmnElements,
  SequenceFlow: OnifySequenceFlow,
  TimerEventDefinition: OnifyTimerEventDefinition,
};

/**
 * Create apps with middleware options
 * @param {number} [instances] Number of instances, defaults to 2
 * @param {import('../../types/interfaces.js').BpmnMiddlewareOptions} [options]
 */
export function horizontallyScaled(instances = 2, options) {
  /** @type {LRUCache<string, any, any>} */
  const storage = new LRUCache({ max: 1000 });
  const apps = new Array(instances).fill().map(() => getAppWithExtensions({ adapter: new MemoryAdapter(storage), ...options }));

  return {
    storage,
    get apps() {
      return apps.slice();
    },
    balance,
    request() {
      return request(balance());
    },
    stop() {
      return Promise.all(
        apps.map((app) => {
          return request(app).delete('/rest/internal/stop').expect(204);
        })
      );
    },
    getRunning() {
      return apps.reduce((result, app) => {
        result = result.concat(...app.locals.engineCache.values());
        return result;
      }, []);
    },
    /**
     * @param {string} token
     */
    getRunningByToken(token) {
      return apps.reduce((result, app) => {
        const engine = app.locals.engineCache.get(token);
        if (engine) result.push(engine);
        return result;
      }, []);
    },
  };

  function balance() {
    const app = apps.shift();
    apps.push(app);
    return app;
  }
}

/**
 * @param {import('../../types/interfaces.js').MiddlewareEngineOptions} options
 */
export function getAppWithExtensions(options = {}) {
  const app = express();
  const broker = (app.locals.broker = options.broker ?? new Broker(app));
  broker.assertExchange('event', 'topic', { durable: false, autoDelete: false });

  const { engineOptions, ...middlewareOptions } = options;
  const middleware = bpmnEngineMiddleware({
    broker,
    engineOptions: {
      moddleOptions: { camunda },
      elements,
      extensions: { onify: extensions },
      extendFn,
      ...engineOptions,
    },
    ...middlewareOptions,
  });

  app.locals.middleware = middleware;
  app.locals.engineCache = middleware.engines.engineCache;

  app.use('/rest', middleware);
  app.use(errorHandler);
  return app;
}

export async function getExampleApp() {
  const { app, middleware } = await import('../../example/app.js');
  app.locals.middleware = middleware;
  return app;
}

/**
 * Create deployment
 * @param {import('express').Express} app
 * @param {string} name
 * @param {string | Buffer} source
 * @param {string[]} [additionalFiles]
 */
export async function createDeployment(app, name, source, additionalFiles) {
  const form = await createDeploymentForm(name, source, additionalFiles);
  const response = await request(app).post('/rest/deployment/create').set(form.getHeaders()).send(form.getBuffer().toString());
  return response;
}

/**
 * Create deployment multi-part-form
 * @param {string} name
 * @param {string | Buffer} source
 * @param {string[]} [additionalFiles]
 */
export async function createDeploymentForm(name, source, additionalFiles) {
  const form = new FormData();
  form.append('deployment-name', name);
  form.append('deployment-source', 'Test modeler');
  form.append(`${name}.bpmn`, source, { filename: `${name}.bpmn`, contentType: 'application/octet-stream' });

  if (additionalFiles?.length) {
    for (const filePath of additionalFiles) {
      const filename = path.basename(filePath);
      const content = await fs.promises.readFile(filePath);
      form.append(filename, content, { filename, contentType: 'application/octet-stream' });
    }
  }

  return form;
}

/**
 * Wait for process event
 * @param {import('express').Express} app
 * @param {string} nameOrToken
 */
export function waitForProcess(app, nameOrToken) {
  const broker = app.locals.broker;
  return {
    end,
    stop,
    error,
    wait,
    call,
    event,
    idle,
    timer,
  };

  function end() {
    return event('engine.end');
  }

  function stop() {
    return event('engine.stop');
  }

  /**
   * @param {string} activityId
   */
  function wait(activityId) {
    if (!activityId) return event('activity.wait');
    return event('activity.wait', (msg) => {
      return msg.content.id === activityId;
    });
  }

  /**
   * @param {string} activityId
   */
  function call(activityId) {
    if (!activityId) return event('activity.call');
    return event('activity.call', (msg) => {
      return msg.content.id === activityId;
    });
  }

  /**
   * @param {string} activityId
   */
  function timer(activityId) {
    if (!activityId) return event('activity.timer');
    return event('activity.timer', (msg) => {
      return msg.content.id === activityId;
    });
  }

  function idle() {
    const engine = app.locals.engineCache.get(nameOrToken);
    if (!engine) throw new Error(`No engine with token >>${nameOrToken}<<`);
    const idleTimer = engine.idleTimer;
    if (idleTimer.expireAt <= new Date()) {
      idleTimer?.callback();
    }
  }

  /**
   * @param {string} eventRoutingKey
   * @param {CallableFunction} [expectFn]
   */
  function event(eventRoutingKey, expectFn) {
    return new Promise((resolve, reject) => {
      const rnd = randomInt(10000);
      const errConsumerTag = `err_${rnd}`;
      const waitConsumerTag = `wait_${rnd}`;
      broker.subscribeTmp(
        'event',
        eventRoutingKey,
        (_, msg) => {
          if (filterByNameOrToken(msg, expectFn)) {
            broker.cancel(msg.fields.consumerTag);
            broker.cancel(errConsumerTag);
            resolve(msg);
          }
        },
        { noAck: true, consumerTag: waitConsumerTag }
      );

      broker.subscribeTmp(
        'event',
        'engine.error',
        (_, msg) => {
          if (filterByNameOrToken(msg)) {
            broker.cancel(msg.fields.consumerTag);
            broker.cancel(waitConsumerTag);
            reject(msg.content);
          }
        },
        { noAck: true, consumerTag: errConsumerTag }
      );
    });
  }

  function error() {
    return new Promise((resolve, reject) => {
      const rnd = randomInt(10000);
      const errConsumerTag = `err_${rnd}`;
      const waitConsumerTag = `wait_${rnd}`;
      broker.subscribeTmp(
        'event',
        'engine.end',
        (_, msg) => {
          if (filterByNameOrToken(msg)) {
            broker.cancel(msg.fields.consumerTag);
            broker.cancel(errConsumerTag);
            reject(new Error('Expected error but ended'));
          }
        },
        { noAck: true, consumerTag: waitConsumerTag }
      );

      broker.subscribeTmp(
        'event',
        'engine.error',
        (_, msg) => {
          if (filterByNameOrToken(msg)) {
            broker.cancel(msg.fields.consumerTag);
            broker.cancel(waitConsumerTag);
            resolve(msg.content);
          }
        },
        { noAck: true, consumerTag: errConsumerTag }
      );
    });
  }

  /**
   * @param {import('bpmn-elements').ElementBrokerMessage} msg
   * @param {CallableFunction} [expectFn]
   */
  function filterByNameOrToken(msg, expectFn) {
    const matchToken = msg.properties.token === nameOrToken || msg.properties.deployment === nameOrToken;
    if (matchToken && expectFn && !expectFn(msg)) return false;
    return matchToken;
  }
}

export function fakeTimers() {
  let counter = 0;
  /** @type {any[]} */
  const registered = [];

  return new bpmnElements.Timers({
    registered,
    // @ts-ignore
    setTimeout: function fakeSetTimeout() {
      const ref = counter++;
      registered.push(ref);
      return ref;
    },
    clearTimeout: function fakeClearTimeout(ref) {
      const idx = registered.indexOf(ref);
      if (idx > -1) registered.splice(idx, 1);
    },
  });
}

/**
 * Express error handler middleware
 * @param {Error} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function errorHandler(err, _req, res, next) {
  if (!(err instanceof Error)) return next();
  debug(err.message, err);
  if (err instanceof HttpError) return res.status(err.statusCode).send({ message: err.message });
  res.status(502).send({ message: err.message });
}

/**
 * @param {string} name
 */
export function getResource(name) {
  return fs.readFileSync(path.join('./test/resources/', name));
}

/**
 * @param {string} name
 */
export function getExampleResource(name) {
  return fs.readFileSync(path.join('./example/processes/', name));
}

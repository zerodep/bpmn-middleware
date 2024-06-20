import { randomInt } from 'node:crypto';
import { createRequire } from 'node:module';

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

const nodeRequire = createRequire(import.meta.url);

const camunda = nodeRequire('camunda-bpmn-moddle/resources/camunda.json');

const elements = {
  ...bpmnElements,
  SequenceFlow: OnifySequenceFlow,
  TimerEventDefinition: OnifyTimerEventDefinition,
};

export function horizontallyScaled(instances = 2, options) {
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
        }),
      );
    },
    getRunning() {
      return apps.reduce((result, app) => {
        result = result.concat(...app.locals.engineCache.values());
        return result;
      }, []);
    },
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

export function getAppWithExtensions(options = {}) {
  const app = express();
  const broker = (app.locals.broker = options.broker ?? new Broker(app));
  broker.assertExchange('event', 'topic', { durable: false, autoDelete: false });

  const engineCache = (app.locals.engineCache = options.engineCache ?? new LRUCache({ max: 1000 }));

  const { engineOptions, ...middlewareOptions } = options;
  const middleware = bpmnEngineMiddleware({
    broker,
    engineCache,
    engineOptions: {
      moddleOptions: { camunda },
      elements,
      extensions: { onify: extensions },
      extendFn,
      ...engineOptions,
    },
    ...middlewareOptions,
  });
  app.use('/rest', middleware);
  app.use(errorHandler);
  return app;
}

export async function createDeployment(app, name, source) {
  const form = new FormData();
  form.append('deployment-name', name);
  form.append('deployment-source', 'Test modeler');
  form.append(`${name}.bpmn`, source, `${name}.bpmn`);

  const response = await request(app).post('/rest/deployment/create').set(form.getHeaders()).send(form.getBuffer().toString());

  return response;
}

export function waitForProcess(app, nameOrToken) {
  const broker = app.locals.broker;
  return {
    end,
    stop,
    error,
    wait,
    event,
    idle,
  };

  function end() {
    return event('engine.end');
  }

  function stop() {
    return event('engine.stop');
  }

  function wait(activityId) {
    if (!activityId) return event('activity.wait');
    return event('activity.wait', (msg) => {
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
        { noAck: true, consumerTag: waitConsumerTag },
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
        { noAck: true, consumerTag: errConsumerTag },
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
        { noAck: true, consumerTag: waitConsumerTag },
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
        { noAck: true, consumerTag: errConsumerTag },
      );
    });
  }

  function filterByNameOrToken(msg, expectFn) {
    const matchToken = msg.properties.token === nameOrToken || msg.properties.deployment === nameOrToken;
    if (matchToken && expectFn && !expectFn(msg)) return false;
    return matchToken;
  }
}

export function fakeTimers() {
  let counter = 0;
  const registered = [];

  return new bpmnElements.Timers({
    registered,
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

export function errorHandler(err, req, res, next) {
  if (!(err instanceof Error)) return next();
  // eslint-disable-next-line no-console
  if (process.env.TEST_ERR) console.log({ err });
  if (err instanceof HttpError) return res.status(err.statusCode).send({ message: err.message });
  res.status(502).send({ message: err.message });
}

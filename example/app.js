import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { Broker } from 'smqp';
import { LRUCache } from 'lru-cache';
import { extensions, OnifySequenceFlow, extendFn } from '@onify/flow-extensions';
import * as bpmnElements from 'bpmn-elements';

import { bpmnEngineMiddleware, HttpError, MemoryAdapter } from '../src/index.js';
import { factory as ScriptsFactory } from './middleware-scripts.js';

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

const nodeRequire = createRequire(import.meta.url);

const camunda = nodeRequire('camunda-bpmn-moddle/resources/camunda.json');

const elements = {
  ...bpmnElements,
  SequenceFlow: OnifySequenceFlow,
};

const app = express();
const adapter = new MemoryAdapter();
const broker = (app.locals.broker = new Broker(app));
const engineCache = (app.locals.engineCache = new LRUCache({ max: 1000 }));

broker.assertExchange('event', 'topic', { durable: false, autoDelete: false });

const middleware = bpmnEngineMiddleware({
  adapter,
  broker,
  engineCache,
  Scripts: ScriptsFactory,
  engineOptions: {
    moddleOptions: { camunda },
    elements,
    extensions: { onify: extensions },
    extendFn,
  },
});

app.use('/rest', middleware);

app.use(errorHandler);

if (isMainModule) {
  app.listen(3000);
}

export { app };

function errorHandler(err, req, res, next) {
  if (!(err instanceof Error)) return next();
  // eslint-disable-next-line no-console
  if (isMainModule) console.log({ err });
  if (err instanceof HttpError) return res.status(err.statusCode).send({ message: err.message });
  res.status(502).send({ message: err.message });
}

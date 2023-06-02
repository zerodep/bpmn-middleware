import express from 'express';
import { Broker } from 'smqp';
import { LRUCache } from 'lru-cache';
import { createRequire } from 'node:module';
import { extensions, OnifySequenceFlow } from '@onify/flow-extensions';
import * as bpmnElements from 'bpmn-elements';

import { bpmnEngineMiddleware, HttpError } from '../src/index.js';

const nodeRequire = createRequire(import.meta.url);

const camunda = nodeRequire('camunda-bpmn-moddle/resources/camunda.json');

const elements = {
  ...bpmnElements,
  SequenceFlow: OnifySequenceFlow,
};

const app = express();
const broker = app.locals.broker = new Broker(app);
const engineCache = app.locals.engineCache = new LRUCache({ max: 1000 });

broker.assertExchange('event', 'topic', { durable: false, autoDelete: false });

const middleware = bpmnEngineMiddleware({
  broker,
  engineCache,
  engineOptions: {
    moddleOptions: { camunda },
    elements,
    extensions: { onify: extensions },
  },
});

app.use('/rest', middleware);

app.use(errorHandler);

app.listen(3000);

function errorHandler(err, req, res, next) {
  if (!(err instanceof Error)) return next();
  // eslint-disable-next-line no-console
  console.log({ err });
  if (err instanceof HttpError) return res.status(err.statusCode).send({ message: err.message });
  res.status(502).send({ message: err.message });
}

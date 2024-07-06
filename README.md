# bpmn-middleware

[![Build](https://github.com/zerodep/bpmn-middleware/actions/workflows/build.yaml/badge.svg)](https://github.com/zerodep/bpmn-middleware/actions/workflows/build.yaml)[![Coverage Status](https://coveralls.io/repos/github/zerodep/bpmn-middleware/badge.svg?branch=main)](https://coveralls.io/github/zerodep/bpmn-middleware?branch=main)

Express middleware for [BPMN engine](https://npmjs.com/package/bpmn-engine).

Under construction so breaking changes will occur until v1.

- [Api documentation](./docs/API.md)

## Usage

```javascript
import express from 'express';
import { Broker } from 'smqp';
import { LRUCache } from 'lru-cache';
import { createRequire } from 'node:module';
import { extensions, OnifySequenceFlow, OnifyTimerEventDefinition, extendFn } from '@onify/flow-extensions';
import * as bpmnElements from 'bpmn-elements';

import { bpmnEngineMiddleware, HttpError } from 'bpmn-middleware';

const nodeRequire = createRequire(import.meta.url);

const camunda = nodeRequire('camunda-bpmn-moddle/resources/camunda.json');

const elements = {
  ...bpmnElements,
  SequenceFlow: OnifySequenceFlow,
  TimerEventDefinition: OnifyTimerEventDefinition,
};

const app = express();
const broker = (app.locals.broker = new Broker(app));
const engineCache = (app.locals.engineCache = new LRUCache({ max: 1000 }));

broker.assertExchange('event', 'topic', { durable: false, autoDelete: false });

const middleware = bpmnEngineMiddleware({
  broker,
  engineCache,
  engineOptions: {
    moddleOptions: { camunda },
    elements,
    extensions: { onify: extensions },
    extendFn,
  },
});

app.use('/rest', middleware);

app.use(errorHandler);

function errorHandler(err, req, res, next) {
  if (!(err instanceof Error)) return next();
  console.log({ err });
  if (err instanceof HttpError) return res.status(err.statusCode).send({ message: err.message });
  res.status(502).send({ message: err.message });
}
```

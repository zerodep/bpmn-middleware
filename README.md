# bpmn-middleware

[![Build](https://github.com/zerodep/bpmn-middleware/actions/workflows/build.yaml/badge.svg)](https://github.com/zerodep/bpmn-middleware/actions/workflows/build.yaml)[![Build (Windows)](https://github.com/zerodep/bpmn-middleware/actions/workflows/build-windows.yaml/badge.svg)](https://github.com/zerodep/bpmn-middleware/actions/workflows/build-windows.yaml)[![Coverage Status](https://coveralls.io/repos/github/zerodep/bpmn-middleware/badge.svg?branch=main)](https://coveralls.io/github/zerodep/bpmn-middleware?branch=main)

Express middleware for [BPMN engine](https://npmjs.com/package/bpmn-engine). Mount it and get a REST api for deploying and running BPMN 2.0 processes, without wiring state and resume handling around the engine yourself.

- Deploy, start, signal, cancel and inspect processes over http. Camunda Modeler can deploy and start diagrams directly, Camunda 8 included
- Engine state is saved to a pluggable [storage adapter](./docs/API.md#storage-adapter) as the process runs, so with a shared store any app instance can pick up a running process
- Engines that only wait for input are stopped when idle and resumed from saved state when signalled
- [Call activities](./docs/call-activity.md) start other deployed diagrams and continue when they complete or fail
- Your own storage, services and scripts plug in, engine events are emitted on the Express app, and custom routes are composed from the same handlers
- Ships type declarations and annotated routes that build into an [OpenAPI document](./example/README.md#openapi-document)

Under construction so breaking changes will occur until v1.

- [Api documentation](./docs/API.md)
- [Example app](./example/README.md)
- [Call activity](./docs/call-activity.md)
- [Multiple extensions](./docs/multiple-extensions.md)

<!-- toc -->

- [Usage](#usage)
- [Debug](#debug)
- [Ecosystem](#ecosystem)

<!-- /toc -->

## Usage

```javascript
import { fileURLToPath } from 'node:url';

import express from 'express';
import { Broker } from 'smqp';
import { LRUCache } from 'lru-cache';
import { extensions, OnifySequenceFlow, extendFn } from '@onify/flow-extensions';
import * as bpmnElements from 'bpmn-elements';

import { bpmnEngineMiddleware, HttpError, MemoryAdapter } from 'bpmn-middleware';
import { factory as ScriptsFactory } from './example/middleware-scripts.js';
import camunda from 'camunda-bpmn-moddle/resources/camunda.json' with { type: 'json' };

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

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
  if (isMainModule) console.log({ err });
  if (err instanceof HttpError) return res.status(err.statusCode).send({ message: err.message });
  res.status(502).send({ message: err.message });
}
```

## Debug

Debug by `DEBUG=bpmn-middleware`, or on windows `$env:DEBUG='bpmn-middleware'`. To be more verbose use `DEBUG=bpmn*`, that will display the whole shebang.

## Ecosystem

- [bpmn-engine](https://npmjs.com/package/bpmn-engine) - BPMN 2.0 execution engine wrapped by this middleware
- [bpmn-elements](https://npmjs.com/package/bpmn-elements) - BPMN 2.0 elements executed by the engine
- [moddle-context-serializer](https://npmjs.com/package/moddle-context-serializer) - serializes a bpmn-moddle context for bpmn-elements
- [@0dep/bpmn-extensions](https://npmjs.com/package/@0dep/bpmn-extensions) - Camunda 8 `zeebe:` extension elements and FEEL expressions
- [@onify/flow-extensions](https://npmjs.com/package/@onify/flow-extensions) - Camunda 7 `camunda:` extension elements
- [dmn-elements](https://npmjs.com/package/dmn-elements) - DMN decision evaluation, used by the [example app](./example/README.md) business rule tasks
- [@0dep/piso](https://npmjs.com/package/@0dep/piso) - ISO 8601 date, duration, and interval parser used for BPMN timers
- [smqp](https://npmjs.com/package/smqp) - in-memory message broker carrying engine and middleware events
- [0dep.se](https://0dep.se) - zerodep project site with try it live pages for BPMN and DMN

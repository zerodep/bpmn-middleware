# bpmn-middleware

[![Build](https://github.com/zerodep/bpmn-middleware/actions/workflows/build.yaml/badge.svg)](https://github.com/zerodep/bpmn-middleware/actions/workflows/build.yaml)[![Coverage Status](https://coveralls.io/repos/github/zerodep/bpmn-middleware/badge.svg?branch=main)](https://coveralls.io/github/zerodep/bpmn-middleware?branch=main)

Express middleware for [BPMN engine](https://npmjs.com/package/bpmn-engine).

Under construction so breaking changes will occur until v1.

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

## Middleware

### `bpmnEngineMiddleware([options])`

Create BPMN engine middleware.

Options:

- `adapter`: Optional [storage adapter](#storage-adapter). Defaults to in-memory adapter based on LRU cache
- `engineOptions`: Optional BPMN Engine [options](https://github.com/paed01/bpmn-engine/blob/master/docs/API.md)
- `engineCache`: Optional engine LRU cache, defaults to `new LRUCache({ max: 1000 })`
- `broker`: Optional [smqp](https://npmjs.com/package/smqp) broker, used for forwarding events from executing engines
- `idleTimeout`: Optional positive integer, engine execution timeout in milliseconds before engine execution is considered idle and is stopped, defaults to 120000ms

Returns Expressjs Router with extra properties:

- `middleware`: middleware route functions
- `engines`: BPMN engines handler

## Routes

- [`GET (*)?/version`](#get-version)
- [`GET (*)?/deployment`](#get-deployment)
- [`POST (*)?/deployment/create`](#post-deploymentcreate)
- [`POST (*)?/process-definition/:deploymentName/start`](#post-process-definitiondeploymentnamestart)
- [`GET (*)?/script/:deploymentName`](#get-scriptdeploymentname)
- [`GET (*)?/running`](#get-running)
- [`GET (*)?/status/:token`](#get-statustoken)
- [`GET (*)?/status/:token/:activityId`](#get-statustokenactivityid)
- [`POST (*)?/resume/:token`](#post-resumetoken)
- [`POST (*)?/signal/:token`](#post-signaltoken)
- [`POST (*)?/cancel/:token`](#post-canceltoken)
- [`POST (*)?/fail/:token`](#post-failtoken)
- [`GET (*)?/state/:token`](#get-statetoken)
- [`DELETE (*)?/state/:token`](#delete-statetoken)
- [`DELETE (*)?/internal/stop`](#delete-internalstop)
- [`DELETE (*)?/internal/stop/:token`](#delete-internalstoptoken)

### `GET (*)?/version`

Get app version.

Response body:

- `version`: string, resolved from `process.cwd() + '/package.json`

### `GET (*)?/deployment`

Get app name.

Response body:

- `name`: string, resolved from `process.cwd() + '/package.json`

### `POST (*)?/deployment/create`

Create deployment by passing multipart form with BPMN diagram file.

Content-type: `multipart/form-data`

Form fields:

- `deployment-name`: string, deployment name;
- `deployment-source`: string, deployment source;

Response body:

- `id`: string, same as deployment name
- `deploymentTime`: date, now
- `deployedProcessDefinitions`: object
  - `[deploymentName]`: object, key as deployment name
    - `id`: string, same as deployment name

### `POST (*)?/process-definition/:deploymentName/start`

Start deployment.

Params:

- `deploymentName`: deployment name

Request body:

- `businessKey`: string, business key
- `variables`: optional object with variables to pass to engine

Response body:

- `id`: string, unique execution token

### `GET (*)?/script/:deploymentName`

Get all declared scripts for deployment

Response:

- `content-type: text/javascript`
- `body`: module script, exported javascript functions where function name non-word characters are replaced with `_`

### `GET (*)?/running`

Get all running instances.

Response body:

- `engines`: list of executing engines
  - `token`: string, unique execution token
  - `name`: string, deployment name
  - `state`: string, engine status, `idle`, `running`, `stopped`, or `error`
  - `activityStatus`: string, running activity status, `idle`, `executing`, `timer`, or `wait`

### `GET (*)?/status/:token`

Get process status

### `GET (*)?/status/:token/:activityId`

Get process activity status

### `POST (*)?/resume/:token`

Resume process run

### `POST (*)?/signal/:token`

Signal process activity.

Request body:

- `id`: activity id
- `executionId`: optional activity execution id
- `message`: optional message to signal activity with

### `POST (*)?/cancel/:token`

Cancel process activity.

Request body:

- `id`: activity id
- `executionId`: optional activity execution id

### `POST (*)?/fail/:token`

Fail process activity.

Request body:

- `id`: activity id
- `executionId`: optional activity execution id
- `message`: optional message to send to activity

### `GET (*)?/state/:token`

Get process engine state.

### `DELETE (*)?/state/:token`

Delete process engine state.

### `DELETE (*)?/internal/stop`

Stop all running instances on this specific app instance.

### `DELETE (*)?/internal/stop/:token`

Stop running instances by token on this specific app instance.

## Events

BPMN Engine will forward BPMN engine events to app prefixed by `bpmn/`.

### Event `bpmn/end`

BPMN Engine has completed successfully.

Handler arguments:

- `engine`: Engine instance

### Event `bpmn/stop`

BPMN Engine execution has stopped.

Handler arguments:

- `engine`: Engine instance

### Event `bpmn/error`

BPMN Engine execution has failed.

Handler arguments:

- `err`: Error
- `engine`: Engine instance

## Storage adapter

Persistent storage adapter, defaults to in memory storage.

Three types will be saved to adapter:

- `deployment`: BPMN deployment with references to BPMN files
- `file`: BPMN file with meta and content
- `state`: BPMN engine state

### `async upsert(type, key, value[, options])`

Set entry with key.

- `type`: string, storage type, `deployment`, `file`, or `state`
- `key`: string, storage key
- `value`: object, value
- `options`: optional object with options

### `async delete(type, key)`

Delete entry by key.

- `type`: string, storage type, `deployment`, `file`, or `state`
- `key`: string, storage key

### `async fetch(type, key[, options])`

Fetch entry by key.

- `type`: string, storage type, `deployment`, `file`, or `state`
- `key`: string, storage key
- `options`: optional object with options
  - `exclude`: optional list of fields to exclude

### `async query(type, qs[, options])`

Query entries.

- `type`: string, storage type, `deployment`, `file`, or `state`
- `qs`: object, storage query
  - `exclude`: optional list of fields to exclude
  - `state`: optional string, get engine states by state of engine, `idle`, `running`, etc
  - `caller`: optional object, get engines by call activity caller
    - `token`: string, calling process token
    - `deployment`: string, calling process deployment name
    - `id`: string, calling activity id
    - `type`: string, calling activity type
    - `executionId`: string, calling activity execution id
- `options`: optional object with options

Returns:

- `records`: List of entries

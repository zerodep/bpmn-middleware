# API

- [Middleware](#bpmnenginemiddlewareoptions)
- [Routes](#routes)

## `bpmnEngineMiddleware([options])`

Create BPMN engine middleware.

Options:

- `adapter`: Optional [storage adapter](#storage-adapter). Defaults to in-memory adapter based on [LRU cache](https://www.npmjs.com/package/lru-cache)
- `engineOptions`: Optional BPMN Engine [options](https://github.com/paed01/bpmn-engine/blob/master/docs/API.md) with some optional properties
  - `settings`: optional engine settings
    - `saveEngineStateOptions`: optional object passed to adapter options
- `maxRunning`: Optional number declaring number of max running engines per instance, passed to engines LRU Cache as max, defaults to 1000
- `engineCache`: Optional engine [LRU](https://www.npmjs.com/package/lru-cache) in-memory cache, defaults to `new LRUCache({ max: 1000, disposeAfter(engine) })`
- `broker`: Optional [smqp](https://npmjs.com/package/smqp) broker, used for forwarding events from executing engines, events are shoveled on middleware name topic exchange
- `idleTimeout`: Optional positive integer, engine execution timeout in milliseconds before engine execution is considered idle and is stopped, defaults to 120000ms
- `autosaveEngineState`: Optional boolean, auto-save engine state during execution, defaults to true
- [`Services`](#services-factory): Optional function to create engine `environment.services`
- [`Scripts`](#scripts-factory): Optional function to create engine `environment.scripts` scripts
- `name`: Optional middleware name, defaults to "default", used to separate middleware instances by creating a middleware broker exchange with said name
- `basePath`: Optional middleware endpoint base path, defaults to `{*splat}`

Returns Expressjs Router with extra properties:

- `middleware`: middleware route functions
- `engines`: BPMN engines handler

### Services factory

Pass function that adds service functions to engine.

**Arguments:**

- `adapter`: [StorageAdapter](#storage-adapter)
- `deploymentName`: name of deployed process
- `businessKey`: started with business key

Called with engine.environment scope.

**Returns:**

- [services](https://github.com/paed01/bpmn-elements/blob/master/docs/Environment.md)

```javascript
import crypto from 'node:crypto';
import { bpmnEngineMiddleware } from 'bpmn-middleware';

const middleware = bpmnEngineMiddleware({
  Services: ServiceFactory,
});

function ServiceFactory(_adapter, deploymentName, businessKey) {
  this.addService('createHash', (data, callback) => {
    const hash = crypto.createHash('md5').update(data).digest('hex');
    if (callback) return callback(null, hash);
    return hash;
  });

  const services = {};
  if (deploymentName === 'my-process' || businessKey === '*') {
    services['myService'] = function myService(...args) {
      const callback = args.pop();
      callback();
    };
  }

  return services;
}
```

### Scripts factory

Pass function that creates script handler passed to engine.

**Arguments:**

- `adapter`: [StorageAdapter](#storage-adapter)
- `deploymentName`: name of deployed process

**Returns:**

- [Scripts](https://github.com/paed01/bpmn-elements/blob/master/docs/Scripts.md)

```javascript
import { bpmnEngineMiddleware, MemoryAdapter } from 'bpmn-middleware';
import { MiddlewareScripts } from '../example/middleware-scripts.js';

const inmemadapter = new MemoryAdapter();

const middleware = bpmnEngineMiddleware({
  adapter: inmemadapter,
  Scripts(adapter, deploymentName, businessKey) {
    return new MiddlewareScripts(adapter, deploymentName, '.', { console }, { timeout: 120000 });
  },
});
```

## Routes

- [`GET {*splat}/version`](#get-splatversion)
- [`GET {*splat}/deployment`](#get-splatdeployment)
- [`POST {*splat}/deployment/create`](#post-splatdeploymentcreate)
- [`POST {*splat}/process-definition/:deploymentName/start`](#post-splatprocess-definitiondeploymentnamestart)
- [`GET {*splat}/script/:deploymentName`](#get-splatscriptdeploymentname)
- [`GET {*splat}/timers/:deploymentName`](#get-splattimersdeploymentname)
- [`GET {*splat}/running`](#get-splatrunning)
- [`GET {*splat}/status/:token`](#get-splatstatustoken)
- [`GET {*splat}/status/:token/:activityId`](#get-splatstatustokenactivityid)
- [`POST {*splat}/resume/:token`](#post-splatresumetoken)
- [`POST {*splat}/signal/:token`](#post-splatsignaltoken)
- [`POST {*splat}/cancel/:token`](#post-splatcanceltoken)
- [`POST {*splat}/fail/:token`](#post-splatfailtoken)
- [`GET {*splat}/state/:token`](#get-splatstatetoken)
- [`DELETE {*splat}/state/:token`](#delete-splatstatetoken)
- [`DELETE {*splat}/internal/stop`](#delete-splatinternalstop)
- [`DELETE {*splat}/internal/stop/:token`](#delete-splatinternalstoptoken)

### `GET {*splat}/version`

Get app version.

Response body:

- `version`: string, resolved from `process.cwd() + '/package.json`

### `GET {*splat}/deployment`

Get app name.

Response body:

- `name`: string, resolved from `process.cwd() + '/package.json`

### `POST {*splat}/deployment/create`

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

### `POST {*splat}/process-definition/:deploymentName/start`

Start deployed processes.

Params:

- `deploymentName`: deployment name

**Request query (case insensetive):**

All query parameters will be passed to `engine.environment.settings`.

- `autosaveEngineState`: force autosave engine state, any value will do, or `false` to disable auto save engine state
- `idleTimeout`: idle timeout delay, positive number of milliseconds or as ISO 8601 duration. Defaults to 60s if `sync` instruction
- `sync`: run until end instruction, any value will do, or `false` to disable, fails run and returns 504 if not completed within idle timeout
- `[string]: any`: any other query parameters

**Request body:**

- `businessKey`: string, business key
- `variables`: optional object with variables to pass to engine

Response body:

- `id`: string, unique execution token

### `GET {*splat}/script/:deploymentName`

Get all declared scripts for deployment

Response:

- `content-type: text/javascript`
- `body`: module script, exported javascript functions where function name non-word characters are replaced with `_`

### `GET {*splat}/timers/:deploymentName`

Get all declared timers for deployment

Response:

- `timers`: list of timers
  - `name`: timer name
  - `parent`: timer parent element
    - `id`: element id
    - `type`: element type
  - `timer`: timer element
    - `timerType`: timer type
    - `value`: timer string value
  - `success`: boolean, true if successfully parsed
  - `expireAt`: closest expire at datetime
  - `delay`: number of milliseconds delay
  - `repeat`: optional repeat number
  - `message`: error message if not successfully parsed

### `GET {*splat}/running`

Get all running instances.

Response body:

- `engines`: list of executing engines
  - `token`: string, unique execution token
  - `name`: string, deployment name
  - `state`: string, engine status, `idle`, `running`, `stopped`, or `error`
  - `activityStatus`: string, running activity status, `idle`, `executing`, `timer`, or `wait`

### `GET {*splat}/status/:token`

Get process status

### `GET {*splat}/status/:token/:activityId`

Get process activity status

### `POST {*splat}/resume/:token`

Resume process run

**Request query (case insensetive):**

- `autosaveEngineState`: force autosave engine state, any value will do, or `false` to disable auto save engine state
- `idleTimeout`: idle timeout delay, positive number of milliseconds or as ISO 8601 duration
- `sync`: run until end instruction, any value will do, or `false` to disable, returns 504 if not completed within idle timeout

Any other query parametes will also be passed as resume options.

### `POST {*splat}/signal/:token`

Signal process activity.

**Request query (case insensetive):**

- `autosaveEngineState`: force autosave engine state, any value will do, or `false` to disable auto save engine state
- `idleTimeout`: idle timeout delay, positive number of milliseconds or as ISO 8601 duration
- `sync`: run until end instruction, any value will do, or `false` to disable, returns 504 if not completed within idle timeout

Any other query parametes will also be passed as resume options.

**Request body:**

- `id`: activity id
- `executionId`: optional activity execution id
- `message`: optional message to signal activity with

### `POST {*splat}/cancel/:token`

Cancel process activity.

**Request query (case insensetive):**

- `autosaveEngineState`: force autosave engine state, any value will do, or `false` to disable auto save engine state

Any other query parametes will also be passed as resume options.

**Request body:**

- `id`: activity id
- `executionId`: optional activity execution id

### `POST {*splat}/fail/:token`

Fail process activity.

**Request query (case insensetive):**

- `autosaveEngineState`: force autosave engine state, any value will do, or `false` to disable auto save engine state

Any other query parametes will also be passed as resume options.

**Request body:**

- `id`: activity id
- `executionId`: optional activity execution id
- `message`: optional message to send to activity

### `GET {*splat}/state/:token`

Get process engine state.

### `DELETE {*splat}/state/:token`

Delete process engine state.

**Request body:**
Is forwarded to adapter as options

### `DELETE {*splat}/internal/stop`

Stop all running instances on this specific app instance.

### `DELETE {*splat}/internal/stop/:token`

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

### Event `bpmn/warn`

Middleware has caught some asynchronous error that is not fatal, but just to let you know.

Handler arguments:

- `err`: Error

## Storage adapter

Persistent storage adapter, defaults to in memory storage.

Three types will be saved to adapter:

- `deployment`: BPMN deployment with references to BPMN files
- `file`: BPMN file with meta and content
- `state`: BPMN engine state

### `async upsert(type, key, value[, options])`

Upsert entry with key.

- `type`: string, storage type, `deployment`, `file`, or `state`
- `key`: string, storage key
- `value`: object, value
- `options`: optional object with options

### `async update(type, key, value[, options])`

Update entry with key.

- `type`: string, storage type, `deployment`, `file`, or `state`
- `key`: string, storage key
- `value`: object, value
- `options`: optional object with options

If the key was not found throw an [error with code](#storage-key-not-found) `ERR_BPMN_MIDDLEWARE_STORAGE_KEY_NOT_FOUND` to facilitate saving state. The error code should be among the exported constants of this project.

### `async fetch(type, key[, options])`

Fetch entry by key.

- `type`: string, storage type, `deployment`, `file`, or `state`
- `key`: string, storage key
- `options`: optional object with options
  - `exclude`: optional list of fields to exclude

### `async delete(type, key[, options])`

Delete entry by key.

- `type`: string, storage type, `deployment`, `file`, or `state`
- `key`: string, storage key
- `options`: optional object with options

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

### Storage adapter examples

#### Storage key not found

```javascript
import assert from 'node:assert';
import { LRUCache } from 'lru-cache';

import { StorageError, STORAGE_TYPE_STATE, ERR_STORAGE_KEY_NOT_FOUND } from 'bpmn-middleware';

class MyStorageAdapter {
  constructor() {
    this._data = new LRUCache({ max: 1000 });
  }
  async upsert(type, key, value, options) {}
  async update(type, key, value, options) {
    if (!this._data.has(`${type}:${key}`)) throw new StorageError(`${type}:key not found`, ERR_STORAGE_KEY_NOT_FOUND);
    return this.upsert(type, key, value, options);
  }
  async fetch(type, key, value, options) {}
  async delete(type, key) {}
  async query(type, qs, options) {}
}

(async () => {
  const adapter = new MyStorageAdapter();

  try {
    await adapter.update(STORAGE_TYPE_STATE, 'madeuptoken', {});
  } catch (err) {
    var error = err;
  }

  assert.equal(error?.code, ERR_STORAGE_KEY_NOT_FOUND);
})();
```

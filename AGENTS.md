# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm test` — run mocha; `posttest` chains `lint`, `dist`, and `test:md`.
- `npm run lint` — `eslint . --cache && prettier . --check --cache`.
- `npm run dist` — generate `types/index.d.ts` via `dts-buddy` (from JSDoc) and bundle the CJS build via `rollup`.
- `npm run cov:html` / `npm run test:lcov` — coverage with `c8` (covers `src/` and `example/`).
- `npm run test:md` — runs `texample` against `README.md`, `docs/API.md`, and `example/README.md`. Code blocks in those files are executed; keep them runnable when editing.
- Single test: `npx mocha test/features/resume-feature.js` (or any single file). Add `--grep "<scenario name>"` to target a single Scenario in a `mocha-cakes-2` file. The repo's `.mocharc.json` already wires `chai/register-expect.js` and `test/helpers/setup.js` and uses the `mocha-cakes-2` UI, so don't pass `--ui bdd`.
- Debug logs: `DEBUG=bpmn-middleware` (or `DEBUG=bpmn*` for the full engine).

## Architecture

This is an Express middleware wrapping [`bpmn-engine`](https://npmjs.com/package/bpmn-engine). It exposes a REST surface for deploying BPMN diagrams, starting/resuming engine executions, and brokering BPMN call-activity calls between deployments. The package ships ESM (`src/index.js`), a CJS bundle (`dist/main.cjs`), and generated `.d.ts` (`types/index.d.ts`).

### Request pipeline

`bpmnEngineMiddleware(options)` in `src/index.js` returns an Express `Router` whose route handlers are produced by `BpmnEngineMiddleware` (`src/bpmn-middleware.js`). Pipelines are composed from small middleware arrays:

- `preStart()` → `[json, addResponseLocals, _parseQueryToEngineOptions, _validateLocals, createEngine]`
- `preResume()` → same, minus `createEngine`
- `start()/resume()/signal()/cancel()/fail()` extend those with the action handler. Each can be wrapped with a custom final handler (see `example/app.js` and `BpmnEngineMiddleware.prototype.startAndTrackEngine`).

`addEngineLocals` populates `res.locals` with `{ middlewareName, token, engines, adapter, broker, listener, engine, executeOptions }`. Custom routes that build on the middleware should also go through `preStart()`/`preResume()` so these locals exist.

### Engines, tokens, and the cache

`Engines` (`src/engines.js`) owns an `LRUCache<token, MiddlewareEngine>` (default `max: 1000`, configurable via `engineCache` or `maxRunning`). Every execution is keyed by a `token` (UUID). Eviction from the cache disposes the engine. `MiddlewareEngine` (`src/middleware-engine.js`) extends `bpmn-engine`'s `Engine` and adds:

- `token` (Symbol-keyed, exposed as a getter)
- `idleTimer` and `startIdleTimer()` — stops the engine when activity status is `wait` or a `timer` is far enough in the future; otherwise re-arms and emits `engine.idle.timer` on the engine broker.
- `expireAt` — earliest non-idle timer expiration.

Sync runs (`?sync=true`, default `idleTimeout` 60000ms) wait for completion via `DeferredCallback` (`src/deferred.js`) and respond with `engine.environment.output`; async runs return `{ id: token }` immediately.

### Storage adapter

State, deployments, and uploaded files all flow through `IStorageAdapter` (see `types/interfaces.d.ts`). Storage types are the constants `STORAGE_TYPE_DEPLOYMENT | STORAGE_TYPE_STATE | STORAGE_TYPE_FILE` (`src/constants.js`). `MemoryAdapter` (`src/memory-adapter.js`) is the in-process LRU implementation and is what tests share across instances to simulate horizontal scaling. `MulterAdapterStorage` plugs the adapter into `multer` so `POST /deployment/create` writes uploaded BPMN files via `adapter.upsert(STORAGE_TYPE_FILE, ...)`.

When `autosaveEngineState` is true (default), the engine broker's `activity.state.save` events trigger `adapter.upsert(STORAGE_TYPE_STATE, token, state)` from `Engines._onStateMessage`. Custom adapters must implement `upsert/update/fetch/query/delete`; use `StorageError` with `ERR_STORAGE_KEY_NOT_FOUND` for missing keys.

### Broker and call activities

Each middleware instance owns an `smqp` topic exchange (default name `default`, override via `options.name`). `BpmnEngineMiddleware` subscribes to four routing keys on that exchange:

- `activity.call` → `_startProcessByCallActivity` — when a BPMN call activity has `calledElement="deployment:<name>"`, look up the deployment, start a new engine, and record the originator as `caller`.
- `activity.call.cancel` → `_cancelProcessByCallActivity` — discard the matching running state via `adapter.query(STATE, { state: 'running', caller })`.
- `definition.end` / `definition.error` → `_postProcessDefinitionRun` — signals or fails the calling activity on the originating engine using `engines.resumeAndSignalActivity` / `resumeAndFailActivity`.

The `Caller` record (`src/caller.js`) ties a called execution back to `{ token, deployment, id, type, executionId, index }`. Don't change its shape without updating the call-activity post-processing on both ends. See `docs/call-activity.md` for the BPMN-side contract.

### App-level events

`BpmnPrefixListener` re-emits engine events on the Express `app` with a `bpmn/` prefix. `app.emit('bpmn/stop-all')` is wired in `init()` to `engines.stopAll()`; tests rely on that to tear down between cases.

## Conventions

- **Use TDD.** Write a failing `mocha-cakes-2` Scenario in `test/features/` (or `test/src/` for unit-level) first, watch it fail with a meaningful message, then implement in `src/` until it passes. Refactor with the suite green. Don't write production code without a failing test driving it.
- Source is JSDoc-annotated JavaScript with `checkJs: true` (see `tsconfig.json`); public types live in `types/interfaces.d.ts` and the generated `types/index.d.ts`. Update interfaces alongside code changes — `npm run dist` will fail otherwise.
- Prettier: 140 col, single quotes, ES5 trailing commas; ESLint enforces `no-var`, `prefer-const`, `eqeqeq`, `require-await`, etc.
- Tests use `mocha-cakes-2` (`Feature/Scenario/Given/When/Then`); `test/helpers/test-helpers.js` exposes `getAppWithExtensions`, `horizontallyScaled`, and `createDeployment`. New features should reuse these rather than building Express apps from scratch.
- README and `docs/API.md` examples are executed by `texample` in CI. If you change the public API, update those snippets so `npm run test:md` keeps passing.

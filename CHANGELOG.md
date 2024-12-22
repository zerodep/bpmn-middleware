# Changelog

## Unreleased

## [0.14.0] - 2024-12-22

- add ability to pass custom start deployment function
- resuming is now accepting `res.locals.token` to facilitate custom routes
- hash user password in example app, it's bad enough that basic auth over http is used

## [0.13.0] - 2024-12-19

- introduce middleware name to facilitate separation between middleware instances
- start relying on middleware broker to manage call activities, consequently stop relying on app events to manage call activities. App events are still fired

## ~~[0.12.0]~~

- unpublished

## [0.11.0] - 2024-12-14

- add middleware class functions that returns request pipelines to facilitate adding own routes
- fix state being null when resuming running engine
- move stuff around, BpmnEngineMiddleware deserves a separate file
- remove bpmnPrefixListener from app.locals

## [0.10.0] - 2024-11-14

- take `autosaveEngineState=false` query parameter on resume execution to disable auto saving engine state, not sure why you would do that? but it's a boolean so it seems fair...

## [0.9.0] - 2024-10-30

- take `autosaveEngineState` query parameter on resume execution to enable auto saving engine state

## [0.8.0] - 2024-10-26

- allow overriding bpmn engine token by setting res.locals.token to string
- allow overriding bpmn engine by setting res.locals.engine to instance of MiddlewareEngine
- debug using `DEBUG=bpmn-middleware`
- fix example app routing order

## [0.7.0] - 2024-10-22

- save business key to state
- pass business key to service- and script factory
- execute service factory function with engine.environment scope

## [0.6.0] - 2024-09-25

- introduce `Services` option that allows setting engine services

## [0.5.1] - 2024-09-11

- fix package commonjs exports

## [0.5.0] - 2024-07-18

- introduce `maxRunning` option to control max number of running engines per instance

## [0.4.1] - 2024-07-17

- make sure `Script` options is used when engine is resumed

## [0.4.0] - 2024-07-14

- introduce `Scripts` option that allows overriding engine scripts

## [0.3.0] - 2024-07-09

- add `GET (*)?/timers/:deploymentName` endpoint to serve timers
- add new middleware option to disable auto-save state
- require storage adapter `update` function to update an existing entity. The function takes same arguments as `upsert` but will/should throw if the entity key was not found
- add default BPMN Engine service functions: `saveState`, `disableSaveState`, `enableSaveState`. The functions takes no arguments, at the moment

## [0.2.0] - 2024-06-20

- add scripts endpoint that serves BPMN deployment javascripts module

## [0.1.0] - 2024-06-18

- generate type declarations with [dts-buddy](https://www.npmjs.com/package/dts-buddy)

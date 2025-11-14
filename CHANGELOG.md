# Changelog

## Unreleased

## [0.18.2] - 2025-11-13

- pedigree npm release

## [0.18.1] - 2025-08-13

- allow @0dep/piso peer dependency above and beyond v2

## [0.18.0] - 2025-05-20

- upgrade [multer@2](https://www.npmjs.com/package/multer) a middleware for handling multipart/form-data

## [0.17.2] - 2025-05-04

- fix complaining type declaration by NOT returning in route functions

## [0.17.1] - 2025-05-03

- support express@5, replace wildcard route `(*)?` with `{*splat}`, and apparently `req.body` can be undefined
- introduce new optional `basePath` option to control middleware endpoint base path

## [0.17.0] - 2025-01-22

Playing around with custom adapters requiring specials options per engine revealed some problems. An attempt to solve just that.

- forward query parameters as resume options when calling `(*)?/status/:token`
- forward query parameters as resume options when calling `(*)?/status/:token/:activityId`
- add ability to clone current `res.locals.engines` with override options to facilitate passing custom adapter per engine
- pass engine save state options along when tinkering with call activities

## [0.16.1] - 2025-01-10

- `DELETE (*)?/state/:token` forwards body to adapter delete as options

## [0.16.0] - 2025-01-08

- run/resume/signal engine in sync, i.e. run until end and return output as result
- publish engine error broker message if save state fails
- make sure engine broker state exchange and queue is removed when run is completed

## [0.15.2] - 2024-12-30

- add some save state options, more docs to come

## [0.15.1] - 2024-12-28

- accept options when deleting from storaga adapter

## [0.15.0] - 2024-12-27

- add ability to pass custom resume engine request handler function
- re-arrange src files

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

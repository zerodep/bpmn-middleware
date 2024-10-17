# Changelog

## Unreleased

## [0.7.0] - 2024-09-25

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

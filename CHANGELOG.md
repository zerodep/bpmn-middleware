# Changelog

# Unreleased

## [0.3.0] - 2024-07-09

- add `GET (*)?/timers/:deploymentName` endpoint to serve timers
- add new middleware option to disable auto-save state
- require storage adapter `update` function to update an existing entity. The function takes same arguments as `upsert` but will/should throw if the entity key was not found
- add default BPMN Engine service functions: `saveState`, `disableSaveState`, `enableSaveState`. The functions takes no arguments, at the moment

## [0.2.0] - 2024-06-20

- add scripts endpoint that serves BPMN deployment javascripts module

## [0.1.0] - 2024-06-18

- generate type declarations with [dts-buddy](https://www.npmjs.com/package/dts-buddy)

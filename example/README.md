# Example app

Start your Camunda Modeler and hit play. REST endpoint is `http://localhost:3000/rest`.

## Authenticated example

An example with basic auth is exposed under:

`http://localhost:3000/rest/auth`

## DMN decisions

Deployed DMN decisions are evaluated with [dmn-elements](https://npmjs.com/package/dmn-elements). Deploy the DMN file through `POST /rest/deployment/create` just like a BPMN diagram, then evaluate a decision with the request body as decision input:

`POST http://localhost:3000/decision/:deploymentName/:decisionId`

The response carries the decision result and the evaluation trace — evaluated elements in completion order with requirement bindings, and hit policy resolution for decision tables — `{ result, trace }`.

Business rule tasks are wired to the same decision evaluation. Address the deployed decision with `camunda:decisionRef="deploymentName/decisionId"`; the engine environment variables are passed as decision input and `camunda:resultVariable` captures the result, see [dinner.bpmn](processes/dinner.bpmn) and [dinner.dmn](processes/dinner.dmn). Evaluating a decision that is not deployed renders an error.

# Example app

Start your Camunda Modeler and hit play. REST endpoint is `http://localhost:3000/rest`.

<!-- toc -->

- [Camunda 8 diagrams from Camunda Modeler](#camunda-8-diagrams-from-camunda-modeler)
- [Authenticated example](#authenticated-example)
- [DMN decisions](#dmn-decisions)
- [OpenAPI document](#openapi-document)
- [AMQP workers](#amqp-workers)

<!-- /toc -->

## Camunda 8 diagrams from Camunda Modeler

The middleware ships Camunda 8 REST API v2 routes so Camunda Modeler (>= 5.39) can deploy and start Camunda 8 diagrams directly. Configure a connection in the modeler:

- Target: Self-Managed
- Cluster URL: `http://localhost:3000/rest/v2`
- Authentication: None, or HTTP Basic with an example app user
- Operate URL (optional): `http://localhost:3000/rest`, makes the modeler's "Open in Operate" link after starting an instance redirect to `GET /rest/status/:processInstanceKey`

The modeler probes `GET /rest/v2/topology` to pick the REST protocol, deploys with `POST /rest/v2/deployments`, and starts instances with `POST /rest/v2/process-instances`. The deployment is named after the diagram file name without extension, and the returned process instance key is the middleware engine token, so a started instance can be inspected and signalled through the ordinary `/rest` routes, e.g. `GET /rest/status/:processInstanceKey`.

Deployed `.dmn` resources are evaluated by deployment name, so a business rule task with `zeebe:calledDecision decisionId="deploymentName/decisionId"` finds decisions deployed from the modeler as long as the DMN file is named `deploymentName.dmn`, see [camunda8-dinner.bpmn](processes/camunda8-dinner.bpmn) which expects [dinner.dmn](processes/dinner.dmn) deployed as `dinner-decisions.dmn`.

## Authenticated example

An example with basic auth is exposed under:

`http://localhost:3000/rest/auth`

## DMN decisions

Deployed DMN decisions are evaluated with [dmn-elements](https://npmjs.com/package/dmn-elements). Deploy the DMN file through `POST /rest/deployment/create` just like a BPMN diagram, then evaluate a decision with the request body as decision input:

`POST http://localhost:3000/decision/:deploymentName/:decisionId`

The response carries the decision result and the evaluation trace — evaluated elements in completion order with requirement bindings, and hit policy resolution for decision tables — `{ result, trace }`.

Business rule tasks are wired to the same decision evaluation. Address the deployed decision with `camunda:decisionRef="deploymentName/decisionId"`; the engine environment variables are passed as decision input and `camunda:resultVariable` captures the result, see [dinner.bpmn](processes/dinner.bpmn) and [dinner.dmn](processes/dinner.dmn). Evaluating a decision that is not deployed renders an error.

## OpenAPI document

The app serves a pre-built OpenAPI document at `http://localhost:3000/swagger.json`. [build-swagger.js](build-swagger.js) builds it from the route annotations with [@aller/express-swagger](https://npmjs.com/package/@aller/express-swagger):

```sh
npm run build:swagger --workspace=example
```

The annotations are read from source, so the tsconfig handed to express-swagger has to include the middleware source next to your own files. In an app of your own that is a `tsconfig.swagger.json` like this, extending a tsconfig with `allowJs`:

```json
{
  "extends": "./tsconfig.json",
  "include": ["./**/*.js", "node_modules/bpmn-middleware/src/**/*.js"]
}
```

The example [tsconfig.swagger.json](tsconfig.swagger.json) reaches the same source through `../node_modules`, since the example is a workspace of this repository.

Use that tsconfig for building the document only, not for type checking. The middleware source and its published types both extend `Express.Response.locals`, which `tsc` rejects when they end up in the same program.

With the middleware installed from npm its models are inlined in each operation. To get them as shared `components.schemas`, re-export them by name from a file of your own that the tsconfig includes, e.g. `export type { SignalBody, MiddlewareEngineState } from 'bpmn-middleware'`, see "Sharing a type declared in a dependency" in the express-swagger readme.

## AMQP workers

A command and query variant of the app, in [amqp](amqp), where the http api never runs an engine. Start and signal are commands on an AMQP work queue, two workers consume them and run the engines, and every engine event is published on a topic exchange that feeds a read model answering status queries. Call activities are brokered the same way: the `activity.call` event is queued for any free worker, and the called process `definition.end` event signals the calling activity, on whichever worker picks it up.

Engines are stopped as soon as they wait for input, so a signal resumes the engine from the state in the shared adapter, on either worker. Swap the shared `MemoryAdapter` for a database backed adapter and the workers can run as separate processes.

The api and the workers connect to the broker at `AMQP_URL`, `amqp://localhost` by default, e.g. a RabbitMQ container. The feature test runs the same modules against [amqp-emulator](https://npmjs.com/package/amqp-emulator) instead, so no broker is needed for `npm test`.

```sh
docker run --rm -p 5672:5672 rabbitmq
npm run start:amqp --workspace=example
```

- `POST http://localhost:3001/rest/deployment/create` deploys a diagram as usual, [amqp-order.bpmn](processes/amqp-order.bpmn) and [amqp-fulfilment.bpmn](processes/amqp-fulfilment.bpmn) are deployed at start
- `POST http://localhost:3001/start/amqp-order` publishes a start command and responds with the token as `{ id }`
- `GET http://localhost:3001/status/:token` answers from the read model: state, waiting activities, the worker that ran it, caller and output
- `POST http://localhost:3001/signal/:token` with `{ "id": "approve" }` publishes a signal command, the order is fulfilled by a call activity and completes

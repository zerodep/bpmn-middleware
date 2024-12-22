import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { Broker } from 'smqp';
import { extensions, OnifySequenceFlow, extendFn } from '@onify/flow-extensions';
import * as bpmnElements from 'bpmn-elements';

import { bpmnEngineMiddleware, MemoryAdapter } from '../src/index.js';
import { factory as ScriptsFactory } from './middleware-scripts.js';
import { basicAuth, authorize, addUser } from './middleware/auth.js';
import { runToEnd } from './middleware/runtoend.js';
import { errorHandler } from './middleware/error-handler.js';

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

const nodeRequire = createRequire(import.meta.url);

const camunda = nodeRequire('camunda-bpmn-moddle/resources/camunda.json');

const elements = {
  ...bpmnElements,
  SequenceFlow: OnifySequenceFlow,
};

const app = express();
const adapter = new MemoryAdapter();
const broker = (app.locals.broker = new Broker(app));

const middleware = bpmnEngineMiddleware({
  adapter,
  broker,
  Scripts: ScriptsFactory,
  engineOptions: {
    moddleOptions: { camunda },
    elements,
    extensions: { onify: extensions },
    extendFn,
  },
});

app.use('/rest/auth', basicAuth(adapter));
app.post('/rest/auth/process-definition/:deploymentName/start', middleware.middleware.preStart(), authorize);
app.use('/rest', basicAuth(adapter, true), middleware);
app.post('/start/:deploymentName', basicAuth(adapter, true), middleware.middleware.start(runToEnd));

app.use(errorHandler);

/* c8 ignore next 4 */
if (isMainModule) {
  addUser(adapter, { username: 'admin', password: 'supers3cret' });
  app.listen(3000);
}

export { app, middleware, runToEnd, errorHandler, addUser };

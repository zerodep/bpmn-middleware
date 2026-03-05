import { fileURLToPath } from 'node:url';

import express from 'express';
import { bpmnEngineMiddleware, MemoryAdapter } from 'bpmn-middleware';
import { Broker } from 'smqp';
import { extensions, OnifySequenceFlow, extendFn } from '@onify/flow-extensions';
import * as bpmnElements from 'bpmn-elements';

import { factory as ScriptsFactory } from './middleware-scripts.js';
import { basicAuth, authorize, addUser } from './middleware/auth.js';
import { runToEnd, signal } from './middleware/custom.js';
import { errorHandler } from './middleware/error-handler.js';
import camunda from 'camunda-bpmn-moddle/resources/camunda.json' with { type: 'json' };

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

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
app.post('/start/sync/:deploymentName', basicAuth(adapter, true), middleware.middleware.start(runToEnd));
app.post('/signal/:token', basicAuth(adapter, true), middleware.middleware.resume(signal));

app.use(errorHandler);

/* c8 ignore next 4 */
if (isMainModule) {
  addUser(adapter, { username: 'admin', password: 'supers3cret' });
  app.listen(3000);
}

export { app, middleware, runToEnd, errorHandler, addUser, adapter };

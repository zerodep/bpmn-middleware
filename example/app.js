import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { Broker } from 'smqp';
import { extensions, OnifySequenceFlow, extendFn } from '@onify/flow-extensions';
import * as bpmnElements from 'bpmn-elements';

import { bpmnEngineMiddleware, HttpError, MemoryAdapter } from '../src/index.js';
import { factory as ScriptsFactory } from './middleware-scripts.js';
import { basicAuth, authorize } from './auth.js';

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

broker.assertExchange('event', 'topic', { durable: false, autoDelete: false });

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

app.use(errorHandler);

/* c8 ignore next 3 */
if (isMainModule) {
  app.listen(3000);
}

export { app, middleware };

/**
 * Error handler
 * @param {Error} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function errorHandler(err, _req, res, next) {
  /* c8 ignore next 3 */
  if (!(err instanceof Error)) return next();
  // eslint-disable-next-line no-console
  if (isMainModule) console.log({ err });
  if (err instanceof HttpError) return res.status(err.statusCode).send({ message: err.message });
  res.status(502).send({ message: err.message });
}

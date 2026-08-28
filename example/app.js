import { fileURLToPath } from 'node:url';

import express from 'express';
import { bpmnEngineMiddleware, MemoryAdapter } from 'bpmn-middleware';
import { Broker } from 'smqp';
import { extensions, OnifySequenceFlow, extendFn } from '@onify/flow-extensions';
import { extensions as zeebeExtensions, extendFn as zeebeExtendFn, TimerEventDefinition } from '@0dep/bpmn-extensions';
import * as bpmnElements from 'bpmn-elements';

import { factory as ScriptsFactory } from './middleware-scripts.js';
import { basicAuth, authorize, addUser } from './middleware/auth.js';
import { runToEnd, signal } from './middleware/custom.js';
import { decisionRoute, dmnServiceExtension } from './middleware/dmn.js';
import { errorHandler } from './middleware/error-handler.js';
import { stripCollidingModdleProperties } from './middleware/moddle.js';
import camunda from 'camunda-bpmn-moddle/resources/camunda.json' with { type: 'json' };
import zeebe from 'zeebe-bpmn-moddle/resources/zeebe.json' with { type: 'json' };

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

const elements = {
  ...bpmnElements,
  SequenceFlow: OnifySequenceFlow,
  // parses cron timeCycle, e.g. Camunda 8 timer start events, besides ISO 8601
  TimerEventDefinition,
};

/**
 * Compose the onify and zeebe extend functions, the engine takes only one
 * @param {any} behaviour
 * @param {any} element
 */
function combinedExtendFn(behaviour, element) {
  extendFn(behaviour, element);
  zeebeExtendFn(behaviour);
}

/**
 * Activate the zeebe extension only for elements that carry zeebe extension elements.
 * Unscoped it applies Camunda 8 semantics to every element, e.g. merging a user task
 * signal payload into the process variables, which surprises pure Camunda 7 diagrams.
 * @param {import('bpmn-elements').Activity} element
 * @param {import('bpmn-elements').ContextInstance} context
 */
function scopedZeebeExtensions(element, context) {
  const values = element.behaviour.extensionElements?.values;
  if (!values?.some((ext) => ext.$type?.startsWith('zeebe:'))) return;
  return zeebeExtensions(element, context);
}

const app = express();
const adapter = new MemoryAdapter();
const broker = (app.locals.broker = new Broker(app));

const middleware = bpmnEngineMiddleware({
  adapter,
  broker,
  Scripts: ScriptsFactory,
  engineOptions: {
    // assign output of elements without extensions, e.g. a plain user task signal body
    settings: { assignOutput: 'auto' },
    moddleOptions: { camunda, zeebe: stripCollidingModdleProperties(zeebe) },
    elements,
    // dmn extension is added last to claim the business rule task Service from the zeebe extension
    extensions: { onify: extensions, zeebe: scopedZeebeExtensions, dmn: dmnServiceExtension(adapter) },
    extendFn: combinedExtendFn,
  },
});

app.use('/rest/auth', basicAuth(adapter));
app.post('/rest/auth/process-definition/:deploymentName/start', middleware.middleware.preStart(), authorize);
app.use('/rest', basicAuth(adapter, true), middleware);
app.post('/start/sync/:deploymentName', basicAuth(adapter, true), middleware.middleware.start(runToEnd));
app.post('/signal/:token', basicAuth(adapter, true), middleware.middleware.resume(signal));
app.post('/decision/:deploymentName/:decisionId', basicAuth(adapter, true), express.json(), decisionRoute(adapter));

app.get(
  '/swagger.json',
  /** @private */
  async (_req, res) => {
    const { default: doc } = await import('./swagger.json', { with: { type: 'json' } });
    res.json(doc);
  }
);

app.use(errorHandler);

/* c8 ignore next 4 */
if (isMainModule) {
  addUser(adapter, { username: 'admin', password: 'supers3cret' });
  app.listen(3000);
}

export { app, middleware, runToEnd, errorHandler, addUser, adapter };

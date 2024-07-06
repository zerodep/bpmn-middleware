import { createRequire } from 'node:module';
import * as ck from 'chronokinesis';
import express from 'express';
import FormData from 'form-data';
import request from 'supertest';
import { LRUCache } from 'lru-cache';

import * as middleware from '../src/index.js';
import { getAppWithExtensions, waitForProcess, errorHandler } from './helpers/testHelpers.js';

const { bpmnEngineMiddleware } = middleware;
const nodeRequire = createRequire(import.meta.url);
const packageInfo = nodeRequire('../package.json');

describe('express-middleware', () => {
  let app;
  const getServiceCalls = [];
  const engineCache = new LRUCache({ max: 100 });
  before(() => {
    app = getAppWithExtensions({
      engineCache,
      engineOptions: {
        variables: { json: true },
        settings: { enableDummyService: false },
        services: {
          get(...args) {
            getServiceCalls.push(args);
          },
        },
      },
    });
  });
  beforeEach(() => {
    getServiceCalls.splice(0);
  });
  afterEach(ck.reset);

  describe('exports', () => {
    it('has the expected export', () => {
      expect(middleware.bpmnEngineMiddleware).to.be.a('function');
      expect(middleware.MiddlewareEngine).to.be.a('function');
      expect(middleware.HttpError).to.be.a('function');
      expect(middleware.Engines).to.be.a('function');
      expect(middleware.MemoryAdapter).to.be.a('function');
      expect(middleware.BpmnEngineMiddleware).to.be.a('function');
      expect(middleware.STORAGE_TYPE_DEPLOYMENT).to.equal('deployment');
      expect(middleware.STORAGE_TYPE_STATE).to.equal('state');
      expect(middleware.STORAGE_TYPE_FILE).to.equal('file');
      expect(middleware.DEFAULT_IDLE_TIMER).to.equal(120000);
    });
  });

  describe('bpmnEngineMiddleware()', () => {
    it('exposes middleware instance', () => {
      expect(middleware.bpmnEngineMiddleware().middleware).to.be.instanceof(middleware.BpmnEngineMiddleware);
    });

    it('exposes engines', () => {
      expect(middleware.bpmnEngineMiddleware().engines).to.be.instanceof(middleware.Engines);
    });
  });

  describe('init', () => {
    it('is only initialized once', async () => {
      const engineMiddleware = new middleware.BpmnEngineMiddleware({});

      const myApp = express();
      myApp.get('/rest/version', engineMiddleware.init.bind(engineMiddleware), engineMiddleware.getVersion);
      myApp.use(errorHandler);

      await request(myApp).get('/rest/version').expect(200);

      await request(myApp).get('/rest/version').expect(200);

      expect(myApp.listenerCount('bpmn/end')).to.equal(1);
    });
  });

  describe('addEngineLocals', () => {
    it('adds engines, adapter, and listener to res.locals', async () => {
      const adapter = new middleware.MemoryAdapter();
      const engineMiddleware = new middleware.BpmnEngineMiddleware({ adapter }, new middleware.Engines({ adapter }));

      const myApp = express();
      myApp.use('/rest', engineMiddleware.init.bind(engineMiddleware));
      myApp.get('/rest/locals', engineMiddleware._addEngineLocals, (req, res) => {
        res.send({
          engines: !!res.locals.engines,
          adapter: !!res.locals.adapter,
          listener: !!res.locals.listener,
        });
      });

      myApp.use(errorHandler);

      await request(myApp).get('/rest/locals').expect(200).expect({
        engines: true,
        adapter: true,
        listener: true,
      });

      await request(myApp).get('/rest/locals').expect(200).expect({
        engines: true,
        adapter: true,
        listener: true,
      });
    });

    it('adds locals even if init has not ran', async () => {
      const adapter = new middleware.MemoryAdapter();
      const engineMiddleware = new middleware.BpmnEngineMiddleware({ adapter }, new middleware.Engines({ adapter }));

      const myApp = express();
      myApp.use('/rest/locals', engineMiddleware._addEngineLocals, (req, res) => {
        res.send({
          engines: !!res.locals.engines,
          adapter: !!res.locals.adapter,
          listener: !!res.locals.listener,
        });
      });

      myApp.use(errorHandler);

      await request(myApp).get('/rest/locals').expect(200).expect({
        engines: true,
        adapter: true,
        listener: true,
      });
    });
  });

  describe('modeler integration', () => {
    it('has version route', async () => {
      const { version } = await packageInfo;
      await request(app).get('/rest/version').expect(200).expect({ version });
    });

    it('has deployment route', async () => {
      const { name } = await packageInfo;
      await request(app).get('/rest/deployment').expect(200).expect({ name });
    });
  });

  describe('create', () => {
    it('has deployment create route', async () => {
      ck.freeze();

      const form = new FormData();
      form.append('deployment-name', 'test-deploy');
      form.append('deployment-source', 'Test modeler');
      form.append('test-deploy.bpmn', '<?xml version="1.0" encoding="UTF-8"?>', 'test-deploy.bpmn');

      const response = await request(app).post('/rest/deployment/create').set(form.getHeaders()).send(form.getBuffer().toString());

      expect(response.statusCode, response.text).to.equal(201);
      expect(response.body).to.deep.equal({
        id: 'test-deploy',
        deploymentTime: new Date().toISOString(),
        deployedProcessDefinitions: { ['test-deploy']: { id: 'test-deploy' } },
      });
    });
  });

  describe('start', () => {
    after(() => {
      return request(app).delete('/rest/internal/stop').expect(204);
    });

    it('has deployment start route', async () => {
      const form = new FormData();
      form.append('deployment-name', 'test-deploy-start');
      form.append('deployment-source', 'Test modeler');
      form.append(
        'test-deploy-start.bpmn',
        `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp" isExecutable="true">
        </process>
      </definitions>
      `,
        'test-deploy-start.bpmn',
      );

      await request(app).post('/rest/deployment/create').set(form.getHeaders()).send(form.getBuffer().toString()).expect(201);

      const response = await request(app)
        .post('/rest/process-definition/test-deploy-start/start')
        .expect(201)
        .expect('content-type', 'application/json; charset=utf-8');

      expect(response.body, 'token as id').to.have.property('id').that.is.ok;
    });

    it('start non-existing deployment returns 404', async () => {
      const response = await request(app)
        .post('/rest/process-definition/who-test-deploy-start/start')
        .expect(404)
        .expect('content-type', 'application/json; charset=utf-8');

      expect(response.body).to.have.property('message').that.is.ok;
    });

    it('takes variables when started', async () => {
      const deploymentName = 'test-service';
      const form = new FormData();
      form.append('deployment-name', deploymentName);
      form.append('deployment-source', 'Test modeler');
      form.append(
        `${deploymentName}.bpmn`,
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
          <process id="bp" isExecutable="true">
            <serviceTask id="start">
              <extensionElements>
                <camunda:connector>
                  <camunda:connectorId>get</camunda:connectorId>
                  <camunda:inputOutput>
                    <camunda:inputParameter name="options">
                      <camunda:map>
                        <camunda:entry key="uri">http://example.com/\${environment.variables.businessKey}/\${environment.variables.foo}</camunda:entry>
                        <camunda:entry key="json">\${environment.variables.json}</camunda:entry>
                        <camunda:entry key="setting">\${environment.settings.enableDummyService}</camunda:entry>
                      </camunda:map>
                    </camunda:inputParameter>
                    <camunda:outputParameter name="statusCode">\${result[0].statusCode}</camunda:outputParameter>
                  </camunda:inputOutput>
                </camunda:connector>
              </extensionElements>
            </serviceTask>
          </process>
        </definitions>`,
        `${deploymentName}.bpmn`,
      );

      await request(app).post('/rest/deployment/create').set(form.getHeaders()).send(form.getBuffer().toString()).expect(201);

      const ended = waitForProcess(app, 'test-service').end();

      let response = await request(app)
        .post(`/rest/process-definition/${deploymentName}/start`)
        .send({
          businessKey: 'plata',
          variables: { foo: 'bar' },
        })
        .expect('content-type', 'application/json; charset=utf-8');

      expect(response.statusCode, response.text).to.equal(201);

      response = await request(app).get(`/rest/status/${response.body.id}`).expect(200);

      expect(response.statusCode, response.text).to.equal(200);

      expect(response.body).to.have.property('activityStatus', 'executing');
      expect(getServiceCalls).to.have.length(1);
      const [args] = getServiceCalls;
      expect(args[0]).to.have.property('options').that.deep.equal({
        uri: 'http://example.com/plata/bar',
        json: true,
        setting: false,
      });

      args.pop()();

      await ended;
    });

    it('takes variables when started', async () => {
      const deploymentName = 'test-service';
      const form = new FormData();
      form.append('deployment-name', deploymentName);
      form.append('deployment-source', 'Test modeler');
      form.append(
        `${deploymentName}.bpmn`,
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
          <process id="bp" isExecutable="true" camunda:historyTimeToLive="PT10M">
            <serviceTask id="start">
              <extensionElements>
                <camunda:connector>
                  <camunda:connectorId>get</camunda:connectorId>
                  <camunda:inputOutput>
                    <camunda:inputParameter name="options">
                      <camunda:map>
                        <camunda:entry key="uri">http://example.com/\${environment.variables.businessKey}/\${environment.variables.foo}</camunda:entry>
                        <camunda:entry key="json">\${environment.variables.json}</camunda:entry>
                        <camunda:entry key="setting">\${environment.settings.enableDummyService}</camunda:entry>
                      </camunda:map>
                    </camunda:inputParameter>
                    <camunda:outputParameter name="statusCode">\${result[0].statusCode}</camunda:outputParameter>
                  </camunda:inputOutput>
                </camunda:connector>
              </extensionElements>
            </serviceTask>
          </process>
        </definitions>`,
        `${deploymentName}.bpmn`,
      );

      await request(app).post('/rest/deployment/create').set(form.getHeaders()).send(form.getBuffer().toString()).expect(201);

      const ended = waitForProcess(app, 'test-service').end();

      let response = await request(app)
        .post(`/rest/process-definition/${deploymentName}/start`)
        .send({
          businessKey: 'plata',
          variables: { foo: 'bar' },
        })
        .expect('content-type', 'application/json; charset=utf-8');

      expect(response.statusCode, response.text).to.equal(201);

      response = await request(app).get(`/rest/status/${response.body.id}`).expect(200);

      expect(response.statusCode, response.text).to.equal(200);

      expect(response.body).to.have.property('activityStatus', 'executing');
      expect(getServiceCalls).to.have.length(1);
      const [args] = getServiceCalls;
      expect(args[0]).to.have.property('options').that.deep.equal({
        uri: 'http://example.com/plata/bar',
        json: true,
        setting: false,
      });

      args.pop()();

      await ended;
    });
  });

  describe('running', () => {
    let deploymentName;
    before(() => {
      deploymentName = 'user-task';
      const form = new FormData();
      form.append('deployment-name', deploymentName);
      form.append('deployment-source', 'Test modeler');
      form.append(
        `${deploymentName}.bpmn`,
        `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp" isExecutable="true">
          <userTask id="task" />
        </process>
      </definitions>
      `,
        `${deploymentName}.bpmn`,
      );

      return request(app).post('/rest/deployment/create').set(form.getHeaders()).send(form.getBuffer().toString()).expect(201);
    });

    it('has running route', () => {
      return request(app).get('/rest/running').expect(200).expect({ engines: [] });
    });

    it('returns running tokens', async () => {
      const { body: started } = await request(app)
        .post(`/rest/process-definition/${deploymentName}/start`)
        .expect(201)
        .expect('content-type', 'application/json; charset=utf-8');

      const response = await request(app).get('/rest/running').expect(200);

      expect(response.body).to.have.property('engines').with.length(1);
      expect(response.body.engines[0]).to.have.property('token', started.id);
      expect(response.body.engines[0]).to.have.property('name', deploymentName);
    });

    it('has running token route', async () => {
      let response = await request(app)
        .post(`/rest/process-definition/${deploymentName}/start`)
        .expect(201)
        .expect('content-type', 'application/json; charset=utf-8');

      response = await request(app).get(`/rest/status/${response.body.id}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('token');
      expect(response.body).to.have.property('name', deploymentName);
      expect(response.body).to.have.property('state', 'running');
      expect(response.body).to.have.property('activityStatus', 'wait');
    });

    it('non running token returns 404', async () => {
      await request(app).get('/rest/status/non-running-token').expect(404).expect({ message: 'Token non-running-token not found' });
    });
  });

  describe('signal', () => {
    let deploymentName;
    before(() => {
      deploymentName = 'signal';
      const form = new FormData();
      form.append('deployment-name', deploymentName);
      form.append('deployment-source', 'Test modeler');
      form.append(
        `${deploymentName}.bpmn`,
        `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp" isExecutable="true">
          <userTask id="task" />
        </process>
      </definitions>
      `,
        `${deploymentName}.bpmn`,
      );

      return request(app).post('/rest/deployment/create').set(form.getHeaders()).send(form.getBuffer().toString()).expect(201);
    });

    it('signals running instances', async () => {
      const waiting = waitForProcess(app, deploymentName).wait();
      const ended = waitForProcess(app, deploymentName).end();

      const { body } = await request(app)
        .post(`/rest/process-definition/${deploymentName}/start`)
        .expect(201)
        .expect('content-type', 'application/json; charset=utf-8');

      await waiting;

      const response = await request(app).get(`/rest/status/${body.id}`).expect(200);

      expect(response.body.postponed).to.have.length(1);

      await request(app).post(`/rest/signal/${body.id}`).send({ id: response.body.postponed[0].id }).expect(200);

      return ended;
    });
  });

  describe('stop', () => {
    let deploymentName;
    before(() => {
      deploymentName = 'stopped';
      const form = new FormData();
      form.append('deployment-name', deploymentName);
      form.append('deployment-source', 'Test modeler');
      form.append(
        `${deploymentName}.bpmn`,
        `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp" isExecutable="true">
          <userTask id="task" />
        </process>
      </definitions>
      `,
        `${deploymentName}.bpmn`,
      );

      return request(app).post('/rest/deployment/create').set(form.getHeaders()).send(form.getBuffer().toString()).expect(201);
    });

    it('has stop route that stops all running engines on this app instance', async () => {
      await request(app).delete('/rest/internal/stop').expect(204);

      expect(engineCache.size, 'number of running engines').to.equal(0);
    });

    it('stops running instances', async () => {
      const response = await request(app)
        .post(`/rest/process-definition/${deploymentName}/start`)
        .expect(201)
        .expect('content-type', 'application/json; charset=utf-8');

      const startResponse = await request(app).get(`/rest/status/${response.body.id}`).expect(200);

      await request(app).delete(`/rest/internal/stop/${response.body.id}`).expect(204);

      expect(engineCache.has(startResponse.body.token)).to.be.false;
    });

    it('stops running instance timers', async () => {
      const response = await request(app)
        .post(`/rest/process-definition/${deploymentName}/start`)
        .expect(201)
        .expect('content-type', 'application/json; charset=utf-8');

      const startResponse = await request(app).get(`/rest/status/${response.body.id}`).expect(200);

      const token = startResponse.body.token;
      const engine = app.locals.engineCache.get(token);

      const executingTimers = engine.environment.timers.executing;
      expect(executingTimers).to.have.length(1);

      const idleTimer = executingTimers[0];
      expect(idleTimer.timerRef, 'idle timer ref').to.be.ok;

      await request(app).delete(`/rest/internal/stop/${response.body.id}`).expect(204);

      expect(engine.environment.timers.executing.length, 'timers after stop').to.equal(0);
      expect(idleTimer.timerRef, 'idle timer ref').to.not.be.ok;
    });

    it('stop by token route returns 204', async () => {
      await request(app).delete('/rest/internal/stop/non-running-instance').expect(204);
    });
  });

  describe('events', () => {
    let deploymentName;
    before(() => {
      deploymentName = 'events';
      const form = new FormData();
      form.append('deployment-name', deploymentName);
      form.append('deployment-source', 'Test modeler');
      form.append(
        `${deploymentName}.bpmn`,
        `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp" isExecutable="true">
          <userTask id="task" />
          <boundaryEvent id="bound-timer" attachedToRef="task">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">PT10S</timeDuration>
            </timerEventDefinition>
          </boundaryEvent>
        </process>
      </definitions>
      `,
        `${deploymentName}.bpmn`,
      );

      return request(app).post('/rest/deployment/create').set(form.getHeaders()).send(form.getBuffer().toString()).expect(201);
    });
    after(() => {
      return request(app).delete('/rest/internal/stop').expect(204);
    });

    it('emits bpmn events on app', async () => {
      const waitingEvent = waitForProcess(app, deploymentName).wait();
      const timerEvent = waitForProcess(app, deploymentName).event('activity.timer');

      await request(app)
        .post(`/rest/process-definition/${deploymentName}/start`)
        .expect(201)
        .expect('content-type', 'application/json; charset=utf-8');

      await waitingEvent;
      await timerEvent;
    });

    it('emits stop when stopped', async () => {
      const stopped = waitForProcess(app, deploymentName).stop();

      const response = await request(app)
        .post(`/rest/process-definition/${deploymentName}/start`)
        .expect(201)
        .expect('content-type', 'application/json; charset=utf-8');

      await request(app).delete(`/rest/internal/stop/${response.body.id}`).expect(204);

      await stopped;
    });
  });

  describe('errors', () => {
    it('execution error', async () => {
      const deploymentName = 'script-error';
      const form = new FormData();
      form.append('deployment-name', deploymentName);
      form.append('deployment-source', 'Test modeler');
      form.append(
        `${deploymentName}.bpmn`,
        `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp" isExecutable="true">
          <scriptTask id="task" scriptFormat="javascript">
            <script>next(new Error('Unexpected'));</script>
          </scriptTask>
        </process>
      </definitions>
      `,
        `${deploymentName}.bpmn`,
      );

      const errored = waitForProcess(app, deploymentName).error();

      await request(app).post('/rest/deployment/create').set(form.getHeaders()).send(form.getBuffer().toString()).expect(201);

      await request(app).post(`/rest/process-definition/${deploymentName}/start`).expect(201);

      const err = await errored;
      expect(err?.message).to.match(/Unexpected/);
    });

    it('execution error stops idle timer', async () => {
      const deploymentName = 'script-error-2';
      const form = new FormData();
      form.append('deployment-name', deploymentName);
      form.append('deployment-source', 'Test modeler');
      form.append(
        `${deploymentName}.bpmn`,
        `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp" isExecutable="true">
          <userTask id="start" />
          <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
          <scriptTask id="task" scriptFormat="javascript">
            <script>next(new Error('Unexpected'));</script>
          </scriptTask>
        </process>
      </definitions>
      `,
        `${deploymentName}.bpmn`,
      );

      await request(app).post('/rest/deployment/create').set(form.getHeaders()).send(form.getBuffer().toString()).expect(201);

      const response = await request(app).post(`/rest/process-definition/${deploymentName}/start`).expect(201);

      const engine = app.locals.engineCache.get(response.body.id);
      const idleTimer = engine.idleTimer;

      const errored = waitForProcess(app, deploymentName).error();

      await request(app).post(`/rest/signal/${response.body.id}`).send({ id: 'start' }).expect(200);

      await errored;

      expect(idleTimer.timerRef).to.not.be.ok;
    });

    it('bpmn schema error', async () => {
      const deploymentName = 'schema-error';
      const form = new FormData();
      form.append('deployment-name', deploymentName);
      form.append('deployment-source', 'Test modeler');
      form.append(
        `${deploymentName}.bpmn`,
        `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp" isExecutable="true">
          <scriptTask id="task" scriptFormat="javascript">
            <script>next(new Error('Unexpected'));</script>
        </process>
      </definitions>
      `,
        `${deploymentName}.bpmn`,
      );

      await request(app).post('/rest/deployment/create').set(form.getHeaders()).send(form.getBuffer().toString()).expect(201);

      const response = await request(app).post(`/rest/process-definition/${deploymentName}/start`).expect(502);

      expect(response.body.message).to.match(/unparsable content/i);
    });
  });

  describe('routing', () => {
    it('respects parent route', async () => {
      const parentApp = express();
      parentApp.use('/bpmn', bpmnEngineMiddleware());
      parentApp.use(errorHandler);

      const { version } = await packageInfo;
      await request(parentApp).get('/bpmn/version').expect(200).expect({ version });

      await request(parentApp).get('/rest/version').expect(404);
    });

    it('respects no route but responds to all suffixed routes', async () => {
      const parentApp = express();
      parentApp.use(bpmnEngineMiddleware());
      parentApp.use(errorHandler);

      const { version } = await packageInfo;
      await request(parentApp).get('/version').expect(200).expect({ version });

      await request(parentApp).get('/rest/version').expect({ version });

      await request(parentApp).get('/rest/bpmn/version').expect({ version });
    });
  });
});

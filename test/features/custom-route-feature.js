import request from 'supertest';
import * as testHelpers from '../helpers/testHelpers.js';

import { BpmnEngineMiddleware, MemoryAdapter, STORAGE_TYPE_DEPLOYMENT, STORAGE_TYPE_FILE, STORAGE_TYPE_STATE } from '../../src/index.js';

Feature('custom routes', () => {
  Scenario('use middleware functions as custom routes with disabled auto save', () => {
    let apps;
    const adapter = new MemoryAdapter();
    const customAdapter = new MemoryAdapter();
    before('two parallel app instances', () => {
      apps = testHelpers.horizontallyScaled(2, { adapter });
    });
    after(() => apps.stop());

    And('custom start route is added with separate storage adapter, disabled auto save, and shared broker', () => {
      apps.use((app) => {
        const customMiddleware = new BpmnEngineMiddleware({
          name: 'custom',
          adapter: customAdapter,
          broker: app.locals.broker,
          autosaveEngineState: false,
          engineOptions: testHelpers.getBpmnEngineOptions(),
        });

        app.locals.customMiddleware = customMiddleware;

        app.post('/api/v1/start/:deploymentName', customMiddleware.start());
        app.post('/api/v1/signal/:token', customMiddleware.signal());
      });
    });

    And('a process with call activity and one with waiting task are added to custom adapter', async () => {
      await addSource(
        customAdapter,
        'call-process',
        `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <process id="call-process" isExecutable="true">
              <startEvent id="start" />
              <sequenceFlow id="to-call-activity" sourceRef="start" targetRef="call-activity" />
              <callActivity id="call-activity" calledElement="deployment:wait-process" />
              <sequenceFlow id="to-end" sourceRef="call-activity" targetRef="end" />
              <endEvent id="end" />
            </process>
          </definitions>`
      );
      await addSource(customAdapter, 'wait-process', testHelpers.getResource('wait.bpmn').toString());
    });

    And('called process is added to default adapter', async () => {
      await addSource(adapter, 'wait-process', testHelpers.getResource('wait.bpmn').toString());
    });

    let end;
    let app;
    When('custom route starts call activity process', async () => {
      app = apps.balance();
      end = testHelpers.waitForProcess(app, 'call-process').end();

      const response = await request(app).post('/api/v1/start/call-process');
      expect(response.statusCode, response.text).to.equal(201);
    });

    Then('2 engines are running', () => {
      expect(app.locals.customMiddleware.engines.engineCache.size).to.equal(2);
    });

    And('no engines according to default adapter', async () => {
      const defaultRunning = await adapter.query(STORAGE_TYPE_STATE, { state: 'running' });
      expect(defaultRunning.records).to.have.length(0);
    });

    let running;
    When('custom signal route is called addressing waiting task', async () => {
      running = [...app.locals.customMiddleware.engines.engineCache.values()];

      const response = await request(app)
        .post('/api/v1/signal/' + running.find((e) => e.name === 'wait-process').token)
        .send({ id: 'wait' });

      expect(response.statusCode, response.text).to.equal(200);
    });

    Then('call activity process completed', () => {
      return end;
    });

    And('engine states are NOT saved', async () => {
      expect(await customAdapter.fetch(STORAGE_TYPE_STATE, running[0].token), running[0].name).to.not.be.ok;
      expect(await customAdapter.fetch(STORAGE_TYPE_STATE, running[1].token), running[1].name).to.not.be.ok;
    });

    And('not by default adapter', async () => {
      expect(await adapter.fetch(STORAGE_TYPE_STATE, running[0].token), running[0].name).to.not.be.ok;
      expect(await adapter.fetch(STORAGE_TYPE_STATE, running[1].token), running[1].name).to.not.be.ok;
    });
  });

  Scenario('use middleware functions as custom routes with enabled autosave', () => {
    let apps;
    const adapter = new MemoryAdapter();
    const customAdapter = new MemoryAdapter();
    before('two parallel app instances', () => {
      apps = testHelpers.horizontallyScaled(2, { adapter });
    });
    after(() => apps.stop());

    And('custom start route is added with separate storage adapter and enabled auto save and shared broker', () => {
      apps.use((app) => {
        const customMiddleware = new BpmnEngineMiddleware({
          name: 'custom',
          adapter: customAdapter,
          broker: app.locals.broker,
          autosaveEngineState: true,
          engineOptions: testHelpers.getBpmnEngineOptions(),
        });

        app.post('/api/v1/start/:deploymentName', customMiddleware.start());
        app.post('/api/v1/signal/:token', customMiddleware.signal());
      });
    });

    And('a process with call activity and one with waiting task are added to custom route storage', async () => {
      await addSource(
        customAdapter,
        'call-process',
        `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <process id="call-process" isExecutable="true">
              <startEvent id="start" />
              <sequenceFlow id="to-call-activity" sourceRef="start" targetRef="call-activity" />
              <callActivity id="call-activity" calledElement="deployment:wait-process" />
              <sequenceFlow id="to-end" sourceRef="call-activity" targetRef="end" />
              <endEvent id="end" />
            </process>
          </definitions>`
      );
      await addSource(customAdapter, 'wait-process', testHelpers.getResource('wait.bpmn').toString());
    });

    And('called process is added to default adapter', async () => {
      await addSource(adapter, 'wait-process', testHelpers.getResource('wait.bpmn').toString());
    });

    let end;
    When('custom route starts call activity process', async () => {
      const response = await apps.request().post('/api/v1/start/call-process');
      expect(response.statusCode, response.text).to.equal(201);
    });

    let running;
    Then('two engines are running according to custom adapter', async () => {
      running = await customAdapter.query(STORAGE_TYPE_STATE, { state: 'running' });
      expect(running.records).to.have.length(2);
    });

    And('no engines according to default adapter', async () => {
      const defaultRunning = await adapter.query(STORAGE_TYPE_STATE, { state: 'running' });
      expect(defaultRunning.records).to.have.length(0);
    });

    When('custom signal route is called addressing waiting task', async () => {
      const app = apps.balance();

      const response = await request(app)
        .post('/api/v1/signal/' + running.records.find((e) => e.name === 'wait-process').token)
        .send({ id: 'wait' });

      expect(response.statusCode, response.text).to.equal(200);
    });

    Then('call activity process completed', () => {
      return end;
    });

    And('both engine states are saved via custom adapter', async () => {
      expect(await customAdapter.fetch(STORAGE_TYPE_STATE, running.records[0].token), running.records[0].name).to.be.ok;
      expect(await customAdapter.fetch(STORAGE_TYPE_STATE, running.records[1].token), running.records[1].name).to.be.ok;
    });

    But('not by default adapter', async () => {
      expect(await adapter.fetch(STORAGE_TYPE_STATE, running.records[0].token), running.records[0].name).to.not.be.ok;
      expect(await adapter.fetch(STORAGE_TYPE_STATE, running.records[1].token), running.records[1].name).to.not.be.ok;
    });
  });
});

/**
 *
 * @param {import('../../types/interfaces.js').IStorageAdapter} adapter
 * @param {string} name
 * @param {string|Buffer} source
 */
async function addSource(adapter, name, source) {
  await adapter.upsert(STORAGE_TYPE_DEPLOYMENT, name, [{ path: `${name}.bpmn` }]);
  await adapter.upsert(STORAGE_TYPE_FILE, `${name}.bpmn`, {
    content: source,
  });
}

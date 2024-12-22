import { json } from 'express';
import request from 'supertest';
import * as testHelpers from '../helpers/testHelpers.js';
import { runToEnd } from '../../example/app.js';

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

    Given('custom start route is added with separate storage adapter, disabled auto save, and shared broker', () => {
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
    let token;
    When('default route starts wait process', async () => {
      app = apps.balance();
      const response = await request(app).post('/rest/process-definition/wait-process/start').expect(201);
      token = response.body.id;
      end = testHelpers.waitForProcess(app, token).end();
    });

    And('process is signalled', () => {
      return request(app).post(`/rest/signal/${token}`).send({ id: 'wait' }).expect(200);
    });

    Then('run completes', () => {
      return end;
    });

    When('custom route starts call activity process', async () => {
      end = testHelpers.waitForProcess(app, 'call-process', 'custom').end();

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

    Given('custom start route is added with separate storage adapter and enabled auto save and shared broker', () => {
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

  Scenario('use middleware functions with custom start router function', () => {
    let apps;
    const adapter = new MemoryAdapter();
    const customAdapter = new MemoryAdapter();
    before('two parallel app instances', () => {
      apps = testHelpers.horizontallyScaled(2, { adapter });
    });
    after(() => apps.stop());

    Given('custom start route is added with that waits for engine completion and returns output', () => {
      apps.use((app) => {
        const customMiddleware = new BpmnEngineMiddleware({
          name: 'custom',
          adapter: customAdapter,
          broker: app.locals.broker,
          autosaveEngineState: true,
          engineOptions: testHelpers.getBpmnEngineOptions(),
        });

        app.locals.customMiddleware = customMiddleware;

        app.post('/api/v1/start/:deploymentName', customMiddleware.start(runToEnd));
      });
    });

    And('a process with output', async () => {
      await addSource(
        customAdapter,
        'script-process',
        `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="call-process" isExecutable="true">
            <scriptTask id="task" camunda:resultVariable="result" scriptFormat="js">
              <script>
                next(null, {foo: 'bar'})
              </script>
            </scriptTask>
          </process>
        </definitions>`
      );
    });

    let response;
    When('custom route starts process', async () => {
      response = await apps.request().post('/api/v1/start/script-process');
      expect(response.statusCode, response.text).to.equal(200);
    });

    Then('run completes and output is returned as response', () => {
      expect(response.body).to.deep.equal({ result: { foo: 'bar' } });
    });

    Given('a process with timer', async () => {
      await addSource(
        customAdapter,
        'timer-process',
        `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="timer-process" isExecutable="true">
            <intermediateCatchEvent id="timer">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">\${environment.variables.timeout}</timeDuration>
              </timerEventDefinition>
            </intermediateCatchEvent>
          </process>
        </definitions>`
      );
    });

    let app;
    let timer;
    When('custom route starts process', () => {
      app = apps.balance();
      timer = testHelpers.waitForProcess(app, 'timer-process', 'custom').timer();

      request(app)
        .post('/api/v1/start/timer-process')
        .send({ variables: { timeout: 'PT90S' } })
        .then(() => {});
    });

    let token;
    Then('timer is started', async () => {
      const msg = await timer;
      token = msg.properties.token;
    });

    let end;
    And('timer times out', () => {
      end = testHelpers.waitForProcess(app, 'timer-process', 'custom').end();
      const engine = app.locals.customMiddleware.engines.getByToken(token);
      engine.environment.timers.executing.find((t) => t.owner.id === 'timer').callback();
    });

    Then('run completes', () => {
      return end;
    });

    describe('errors', () => {
      let pendingResponse;
      When('process with timer is started with a too long timer', async () => {
        timer = testHelpers.waitForProcess(app, 'timer-process', 'custom').timer();
        pendingResponse = request(app)
          .post('/api/v1/start/timer-process')
          .send({ variables: { timeout: 'PT90S' } })
          .then((res) => res);

        const msg = await timer;
        token = msg.properties.token;
      });

      And('request times out', () => {
        const engine = app.locals.customMiddleware.engines.getByToken(token);
        engine.environment.timers.executing.find((t) => t.owner.name === 'custom').callback();
      });

      Then('run fails with request timeout', async () => {
        response = await pendingResponse;
        expect(response.statusCode, response.text).to.equal(504);
      });

      Given('a process with bad service implementation', async () => {
        await addSource(
          customAdapter,
          'bad-process',
          `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <process id="timer-process" isExecutable="true">
              <serviceTask id="task" implementation="\${environment.services.myService" />
            </process>
          </definitions>`
        );
      });

      When('custom route starts bad service implementation', async () => {
        response = await apps.request().post('/api/v1/start/bad-process');
      });

      Then('run fails', () => {
        expect(response.statusCode, response.text).to.equal(500);
      });

      Given('a process with script that throws', async () => {
        await addSource(
          customAdapter,
          'bad-script-process',
          `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <process id="script-process" isExecutable="true">
              <startEvent id="start">
                <timerEventDefinition>
                  <timeDuration xsi:type="tFormalExpression">PT0.001S</timeDuration>
                </timerEventDefinition>
              </startEvent>
              <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
              <scriptTask id="task" camunda:resultVariable="result" scriptFormat="js">
                <script>
                  next(null, a.b.c);
                </script>
              </scriptTask>
            </process>
          </definitions>`
        );
      });

      When('custom route starts script process', async () => {
        response = await apps.request().post('/api/v1/start/bad-script-process');
      });

      Then('run fails', () => {
        expect(response.statusCode, response.text).to.equal(500);
        expect(response.text).to.contain('next(null, a.b.c)');
      });

      Given('a malformatted process', async () => {
        await addSource(customAdapter, 'malformatted-process', `</xml>`);
      });

      When('custom route starts malformatted process', async () => {
        response = await apps.request().post('/api/v1/start/malformatted-process');
      });

      Then('run fails', () => {
        expect(response.statusCode, response.text).to.equal(500);
      });
    });
  });

  Scenario('use middleware resume-, signal-, cancel-, and fail-functions ', () => {
    let apps;
    const adapter = new MemoryAdapter();
    const customAdapter = new MemoryAdapter();
    before('two parallel app instances', () => {
      apps = testHelpers.horizontallyScaled(2, { adapter });
    });
    after(() => apps.stop());

    Given('custom routes are added', () => {
      apps.use((app) => {
        const customMiddleware = new BpmnEngineMiddleware({
          name: 'custom',
          adapter: customAdapter,
          broker: app.locals.broker,
          autosaveEngineState: true,
          engineOptions: testHelpers.getBpmnEngineOptions(),
        });

        app.post('/start/:deploymentName', customMiddleware.start());
        app.post('/signal', json(), readTokenAndIdFromBody, customMiddleware.signal());
        app.post('/cancel', json(), readTokenAndIdFromBody, customMiddleware.cancel());
        app.post('/fail', json(), readTokenAndIdFromBody, customMiddleware.fail());
      });

      function readTokenAndIdFromBody(req, res, next) {
        res.locals.token = req.body.token;
        req.body = req.body.message;
        next();
      }
    });

    And('a process matching scenario', async () => {
      await addSource(
        customAdapter,
        'signal-process',
        `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="signal-process" isExecutable="true">
            <manualTask id="task" />
            <boundaryEvent id="timer" attachedToRef="task"  cancelActivity="true">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT30S</timeDuration>
              </timerEventDefinition>
            </boundaryEvent>
          </process>
        </definitions>`
      );
    });

    let wait;
    let token;
    When('process is started', async () => {
      const app = apps.balance();
      wait = testHelpers.waitForProcess(app, 'signal-process', 'custom').wait();

      const response = await request(app).post('/start/signal-process');

      expect(response.statusCode, response.text).to.equal(201);

      token = response.body.id;
    });

    Then('run is waiting', () => {
      return wait;
    });

    let end;
    When('run is signalled via custom route', async () => {
      const app = apps.balance();
      end = testHelpers.waitForProcess(app, 'signal-process', 'custom').end();

      const response = await request(app)
        .post(`/signal`)
        .send({ token, message: { id: 'task' } });

      expect(response.statusCode, response.text).to.equal(200);
    });

    Then('signalled run completes', () => {
      return end;
    });

    When('process is started again', async () => {
      const app = apps.balance();
      wait = testHelpers.waitForProcess(app, 'signal-process', 'custom').wait();
      const response = await request(app).post('/start/signal-process').expect(201);
      token = response.body.id;
    });

    Then('run is waiting', () => {
      return wait;
    });

    let fail;
    When('failing activity via custom route', async () => {
      const app = apps.balance();
      fail = testHelpers.waitForProcess(app, 'signal-process', 'custom').error();

      const response = await request(app)
        .post(`/fail`)
        .send({ token, message: { id: 'task' } });

      expect(response.statusCode, response.text).to.equal(200);
    });

    Then('run fails', () => {
      return fail;
    });

    When('process is started again', async () => {
      const app = apps.balance();
      wait = testHelpers.waitForProcess(app, 'signal-process', 'custom').wait();
      const response = await request(app).post('/start/signal-process').expect(201);
      token = response.body.id;
    });

    Then('run is waiting', () => {
      return wait;
    });

    When('cancelling activity via custom route', async () => {
      const app = apps.balance();
      end = testHelpers.waitForProcess(app, 'signal-process', 'custom').end();

      const response = await request(app)
        .post(`/cancel`)
        .send({ token, message: { id: 'timer' } });

      expect(response.statusCode, response.text).to.equal(200);
    });

    Then('run completes', () => {
      return end;
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

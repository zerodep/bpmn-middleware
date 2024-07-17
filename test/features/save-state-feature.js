import request from 'supertest';

import * as testHelpers from '../helpers/testHelpers.js';
import { MemoryAdapter } from '../../src/index.js';
import { StorageError } from '../../src/Errors.js';

const saveStateResource = testHelpers.getExampleResource('save-state.bpmn');
const disableSaveStateResource = testHelpers.getResource('disable-save-state.bpmn');

Feature('save state', () => {
  Scenario('source with service task that saves state and then a timer and a message event, when messaged auto-save is enabled', () => {
    /** @type {MemoryAdapter} */
    let adapter;
    /** @type {ReturnType<testHelpers.horizontallyScaled>} */
    let apps;
    /** @type {ReturnType<testHelpers.horizontallyScaled>} */
    let appsWithoutAutosave;
    before(() => {
      adapter = new MemoryAdapter();
      apps = testHelpers.horizontallyScaled(2, { adapter });
    });
    after(() => {
      apps?.stop();
      appsWithoutAutosave?.stop();
    });

    let deploymentName;
    Given('a source matching scenario is deployed', async () => {
      deploymentName = 'manual-save-state';
      await testHelpers.createDeployment(apps.balance(), deploymentName, saveStateResource);
    });

    let startingApp;
    let timer;
    let token;
    let response;
    When('process is started', async () => {
      startingApp = apps.balance();
      timer = testHelpers.waitForProcess(startingApp, deploymentName).timer();

      response = await request(startingApp).post(`/rest/process-definition/${deploymentName}/start`).expect(201);

      token = response.body.id;
    });

    Then('timer is started', () => {
      return timer;
    });

    let completed;
    When('timer times out', () => {
      const [engine] = apps.getRunningByToken(token);
      completed = engine.waitFor('end');
      const timer = engine.environment.timers.executing.find((t) => t.owner.id === 'timeout');
      timer.callback();
    });

    Then('run completes', () => {
      return completed;
    });

    When('attempting to signal message event', async () => {
      response = await apps
        .request()
        .post('/rest/signal/' + token)
        .send({
          id: 'ContinueMessage',
        });
    });

    Then('bad request is returned since process is already completed', () => {
      expect(response.statusCode, response.text).to.equal(400);
      expect(response.body.message).to.match(/already completed/);
    });

    When('process is started', async () => {
      startingApp = apps.balance();
      timer = testHelpers.waitForProcess(startingApp, deploymentName).timer();

      response = await request(startingApp).post(`/rest/process-definition/${deploymentName}/start`).expect(201);

      token = response.body.id;
    });

    Then('timer is started', () => {
      return timer;
    });

    When('attempting to signal message event', async () => {
      response = await apps
        .request()
        .post('/rest/signal/' + token)
        .send({
          id: 'Message_0',
        });
    });

    Then('run completes', () => {
      return completed;
    });

    When('attempting to signal message event again', async () => {
      response = await apps
        .request()
        .post('/rest/signal/' + token)
        .send({
          id: 'Message_0',
        });
    });

    Then('bad request is returned since process is already completed', () => {
      expect(response.statusCode, response.text).to.equal(400);
      expect(response.body.message).to.match(/already completed/);
    });

    describe('auto-save is disabled', () => {
      Given('a new middleware is added with auto save disabled', () => {
        appsWithoutAutosave = testHelpers.horizontallyScaled(2, { adapter, autosaveEngineState: false });
      });

      When('process is started on manual save instance', async () => {
        startingApp = appsWithoutAutosave.balance();
        timer = testHelpers.waitForProcess(startingApp, deploymentName).timer();

        response = await request(startingApp).post(`/rest/process-definition/${deploymentName}/start`).expect(201);

        token = response.body.id;
      });

      Then('timer is started again', () => {
        return timer;
      });

      When('timer times out', () => {
        const [engine] = appsWithoutAutosave.getRunningByToken(token);
        completed = engine.waitFor('end');
        const timer = engine.environment.timers.executing.find((t) => t.owner.id === 'timeout');
        timer.callback();
      });

      Then('run manually saved instance completes by termination event', () => {
        return completed;
      });

      And('no running engines', () => {
        expect(appsWithoutAutosave.getRunningByToken(token).length).to.not.be.ok;
      });

      When('getting manually saved process state', async () => {
        response = await appsWithoutAutosave
          .request()
          .get('/rest/state/' + token)
          .expect(200);
      });

      Then('save state service is postponed', () => {
        expect(response.body.postponed.find((p) => p.id === 'save-state')).to.be.ok;
      });

      When('attempting to signal message event', async () => {
        startingApp = appsWithoutAutosave.balance();
        completed = testHelpers.waitForProcess(startingApp, deploymentName).end();

        response = await request(startingApp)
          .post('/rest/signal/' + token)
          .send({
            id: 'Message_0',
          });
      });

      Then('OK is returned', () => {
        expect(response.statusCode, response.text).to.equal(200);
      });

      And('signalled manually saved instance completes', () => {
        return completed;
      });

      When('attempting to signal the same process again', async () => {
        response = await appsWithoutAutosave
          .request()
          .post('/rest/signal/' + token)
          .send({
            id: 'Message_0',
          });
      });

      Then('bad request is returned since manually saved process is already completed', () => {
        expect(response.statusCode, response.text).to.equal(400);
        expect(response.body.message).to.match(/already completed/);
      });
    });
  });

  Scenario('source with service tasks that disables state, saves, and then subsequently enables state', () => {
    /** @type {MemoryAdapter} */
    let adapter;
    /** @type {ReturnType<testHelpers.horizontallyScaled>} */
    let apps;

    function serviceFn(...args) {
      args.pop()();
    }

    before(() => {
      adapter = new MemoryAdapter();
      apps = testHelpers.horizontallyScaled(2, { adapter, engineOptions: { services: { serviceFn } } });
    });
    after(() => {
      apps?.stop();
    });

    let deploymentName;
    Given('a source matching scenario is deployed', async () => {
      deploymentName = 'disable-save-state';
      await testHelpers.createDeployment(apps.balance(), deploymentName, disableSaveStateResource);
    });

    let calledApp;
    let timer;
    let token;
    let response;
    When('process is started', async () => {
      calledApp = apps.balance();
      timer = testHelpers.waitForProcess(calledApp, deploymentName).timer();

      response = await request(calledApp).post(`/rest/process-definition/${deploymentName}/start`).expect(201);

      token = response.body.id;
    });

    Then('timer is started', () => {
      return timer;
    });

    let completed;
    When('timer times out', () => {
      const [engine] = apps.getRunningByToken(token);
      completed = engine.waitFor('end');
      const timer = engine.environment.timers.executing.find((t) => t.owner.id === 'timeout');
      timer.callback();
    });

    Then('process completes', () => {
      return completed;
    });

    When('attempting to signal message event', async () => {
      calledApp = apps.balance();
      completed = testHelpers.waitForProcess(calledApp, deploymentName).end();

      response = await request(calledApp)
        .post('/rest/signal/' + token)
        .send({
          id: 'Message_0',
        });
    });

    Then('OK is returned', () => {
      expect(response.statusCode, response.text).to.equal(200);
    });

    And('saved instance completes', () => {
      return completed;
    });

    When('attempting to signal the same process again', async () => {
      response = await apps
        .request()
        .post('/rest/signal/' + token)
        .send({
          id: 'Message_0',
        });
    });

    Then('bad request is returned since manually saved process is already completed', () => {
      expect(response.statusCode, response.text).to.equal(400);
      expect(response.body.message).to.match(/already completed/);
    });

    describe('manually saved process fails', () => {
      function failServiceFn(...args) {
        args.pop()(new Error('Volatile'));
      }

      before(() => {
        apps.stop();
        apps = testHelpers.horizontallyScaled(2, {
          adapter,
          autosaveEngineState: false,
          engineOptions: { services: { serviceFn: failServiceFn } },
        });
      });

      let errored;
      When('process is started with a volatile service function', async () => {
        calledApp = apps.balance();
        errored = testHelpers.waitForProcess(calledApp, deploymentName).error();

        response = await request(calledApp).post(`/rest/process-definition/${deploymentName}/start`).expect(201);

        token = response.body.id;
      });

      Then('run fails', () => {
        return errored;
      });

      When('attempting to signal the failed process', async () => {
        response = await apps
          .request()
          .post('/rest/signal/' + token)
          .send({
            id: 'Message_0',
          });
      });

      Then('bad request is returned since failed process is already completed', () => {
        expect(response.statusCode, response.text).to.equal(400);
        expect(response.body.message).to.match(/failed/);
      });
    });
  });

  Scenario('process fails on manual save state app', () => {
    /** @type {MemoryAdapter} */
    let adapter;
    /** @type {ReturnType<testHelpers.horizontallyScaled>} */
    let apps;
    before(() => {
      adapter = new MemoryAdapter();
      apps = testHelpers.horizontallyScaled(2, { adapter, autosaveEngineState: false });
    });
    after(() => {
      apps?.stop();
    });

    let deploymentName;
    Given('a source matching scenario is deployed', async () => {
      deploymentName = 'volatile-process';

      await testHelpers.createDeployment(
        apps.balance(),
        deploymentName,
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <scriptTask id="task" scriptFormat="javascript">
              <script>next(new Error('Expected'));</script>
            </scriptTask>
          </process>
        </definitions>`
      );
    });

    let errored;
    let calledApp;
    let token;
    let response;
    When('process is started with a volatile service function', async () => {
      calledApp = apps.balance();
      errored = testHelpers.waitForProcess(calledApp, deploymentName).error();

      response = await request(calledApp).post(`/rest/process-definition/${deploymentName}/start`).expect(201);

      token = response.body.id;
    });

    Then('run fails', () => {
      return errored;
    });

    When('attempting to get state of the failed process', async () => {
      response = await apps
        .request()
        .get('/rest/state/' + token)
        .send({
          id: 'Message_0',
        });
    });

    Then('not found is returned', () => {
      expect(response.statusCode, response.text).to.equal(404);
    });
  });

  Scenario('adapter misbehaves', () => {
    /** @type {import('../../types/interfaces.js').IStorageAdapter} */
    let adapter;
    /** @type {ReturnType<testHelpers.horizontallyScaled>} */
    let apps;
    before(() => {
      adapter = new MisbehavingAdapter();
      apps = testHelpers.horizontallyScaled(2, { adapter, autosaveEngineState: false });
    });
    after(() => {
      apps?.stop();
    });

    let deploymentName;
    Given('a source matching scenario is deployed', async () => {
      deploymentName = 'volatile-process';

      await testHelpers.createDeployment(
        apps.balance(),
        deploymentName,
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <scriptTask id="task" scriptFormat="javascript">
              <script>next(new Error('Expected'));</script>
            </scriptTask>
          </process>
        </definitions>`
      );
    });

    let errored;
    let calledApp;
    let token;
    let response;
    When('process is started with a volatile service function', async () => {
      calledApp = apps.balance();
      errored = testHelpers.waitForProcess(calledApp, deploymentName).error();

      response = await request(calledApp).post(`/rest/process-definition/${deploymentName}/start`).expect(201);

      token = response.body.id;
    });

    Then('run fails', () => {
      return errored;
    });

    And('engine is not running', () => {
      expect(apps.getRunningByToken(token)).to.have.length(0);
    });

    When('attempting to get state of the failed process', async () => {
      response = await apps
        .request()
        .get('/rest/state/' + token)
        .send({
          id: 'Message_0',
        });
    });

    Then('not found is returned', () => {
      expect(response.statusCode, response.text).to.equal(404);
    });
  });
});

class MisbehavingAdapter extends MemoryAdapter {
  update(type, key, value, options) {
    if (!this._data.has(`${type}:${key}`)) return Promise.reject(new StorageError(`${type}:key not found`, 'MY_OWN_CODE'));
    return this.upsert(type, key, value, options);
  }
}

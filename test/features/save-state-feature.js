import request from 'supertest';

import * as testHelpers from '../helpers/testHelpers.js';
import { MemoryAdapter, STORAGE_TYPE_STATE } from '../../src/index.js';
import { StorageError } from '../../src/Errors.js';

const saveStateResource = testHelpers.getExampleResource('save-state.bpmn');
const disableSaveStateResource = testHelpers.getResource('disable-save-state.bpmn');
const waitResource = testHelpers.getResource('wait.bpmn');

class MisbehavingAdapter extends MemoryAdapter {
  update(type, key, value, options) {
    if (!this._data.has(`${type}:${key}`)) return Promise.reject(new StorageError(`${type}:key not found`, 'MY_OWN_CODE'));
    return this.upsert(type, key, value, options);
  }
}

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
      expect(response.body.message, response.text).to.match(/already completed/);
    });

    describe('using autoSaveEngineState query parameter', () => {
      let deploymentNameWithWait;
      Given('a source matching scenario is deployed', async () => {
        deploymentNameWithWait = 'waiting-for-input';
        await testHelpers.createDeployment(apps.balance(), deploymentNameWithWait, waitResource);
      });

      let wait;
      When('a process is started that stops waiting for input', async () => {
        startingApp = apps.balance();
        wait = testHelpers.waitForProcess(startingApp, deploymentNameWithWait).wait();

        response = await request(startingApp).post(`/rest/process-definition/${deploymentNameWithWait}/start`).expect(201);

        token = response.body.id;
      });

      Then('processing is waiting', () => {
        return wait;
      });

      let stop;
      Given('run is stopped due to idle timer', () => {
        const [engine] = apps.getRunningByToken(token);
        stop = testHelpers.waitForProcess(startingApp, deploymentNameWithWait).stop();
        engine.idleTimer.callback();

        return stop;
      });

      let end;
      When('signalling run with disabled auto save engine state', async () => {
        const app = apps.balance();

        end = testHelpers.waitForProcess(app, deploymentNameWithWait).end();

        response = await request(app)
          .post('/rest/signal/' + token)
          .query({ autosaveenginestate: 'false' })
          .send({
            id: 'wait',
          })
          .expect(200);
      });

      Then('run completes', () => {
        return end;
      });

      When('signalling run again without auto save engine state query', async () => {
        const app = apps.balance();

        end = testHelpers.waitForProcess(app, deploymentNameWithWait).end();

        response = await request(app)
          .post('/rest/signal/' + token)
          .send({
            id: 'wait',
          });

        expect(response.status, response.text).to.equal(200);
      });

      Then('same token run completes again', () => {
        return end;
      });
    });

    describe('auto-save is disabled', () => {
      Given('a new middleware is added with auto save disabled', () => {
        appsWithoutAutosave = testHelpers.horizontallyScaled(2, { adapter, autosaveEngineState: false });
      });

      When('process with with ttl is started on manual save instance', async () => {
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

      And('adapter contains state with ttl', () => {
        expect(adapter.storage.getRemainingTTL(`${STORAGE_TYPE_STATE}:${token}`)).to.be.within(1, 30001);
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

  Scenario('using saveState service', () => {
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
    Given('a source with a service task that has implementation saveState', async () => {
      deploymentName = 'service-save-state';

      await testHelpers.createDeployment(
        apps.balance(),
        deploymentName,
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <serviceTask id="task" implementation="\${environment.services.saveState}" />
          </process>
        </definitions>`
      );
    });

    let end;
    let calledApp;
    let token;
    let response;
    When('process is started', async () => {
      calledApp = apps.balance();
      end = testHelpers.waitForProcess(calledApp, deploymentName).end();

      response = await request(calledApp).post(`/rest/process-definition/${deploymentName}/start`).expect(201);

      token = response.body.id;
    });

    Then('run completes', () => {
      return end;
    });

    And('engine is not running', () => {
      expect(apps.getRunningByToken(token)).to.have.length(0);
    });

    When('resuming process', async () => {
      calledApp = apps.balance();
      end = testHelpers.waitForProcess(calledApp, deploymentName).end();

      response = await request(calledApp).post('/rest/resume/' + token);

      expect(response.statusCode, response.text).to.equal(200);
    });

    Then('run completes again', () => {
      return end;
    });

    When('resuming process with autosaveEngineState query parameter', async () => {
      calledApp = apps.balance();
      end = testHelpers.waitForProcess(calledApp, deploymentName).end();

      response = await request(calledApp).post(`/rest/resume/${token}`).query({ autosaveEngineState: 'true' });

      expect(response.statusCode, response.text).to.equal(200);
    });

    Then('run completes again', () => {
      return end;
    });

    When('attempting to resume process again', async () => {
      calledApp = apps.balance();
      end = testHelpers.waitForProcess(calledApp, deploymentName).end();

      response = await request(calledApp).post('/rest/resume/' + token);
    });

    Then('bad request is returned since process has completed', () => {
      expect(response.statusCode, response.text).to.equal(400);
    });

    Given('a source with a service task that has implementation saveState followed by a task that requires signal', async () => {
      deploymentName = 'service-save-state-and-wait';

      await testHelpers.createDeployment(
        apps.balance(),
        deploymentName,
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <serviceTask id="save" implementation="\${environment.services.saveState}" />
            <sequenceFlow id="to-wait" sourceRef="save" targetRef="wait" />
            <manualTask id="wait" />
          </process>
        </definitions>`
      );
    });

    When('process is started', async () => {
      calledApp = apps.balance();
      end = testHelpers.waitForProcess(calledApp, deploymentName).end();

      response = await request(calledApp).post(`/rest/process-definition/${deploymentName}/start`).expect(201);

      token = response.body.id;
    });

    When('waiting task is signalled', async () => {
      calledApp = apps.balance();
      end = testHelpers.waitForProcess(calledApp, deploymentName).end();

      response = await request(calledApp)
        .post('/rest/signal/' + token)
        .send({ id: 'wait' });

      expect(response.statusCode, response.text).to.equal(200);
    });

    Then('run completes again', () => {
      return end;
    });

    When('waiting task is signalled again but now with autosave query', async () => {
      calledApp = apps.balance();
      end = testHelpers.waitForProcess(calledApp, deploymentName).end();

      response = await request(calledApp).post(`/rest/signal/${token}`).query({ autosaveenginestate: '1' }).send({ id: 'wait' });

      expect(response.statusCode, response.text).to.equal(200);
    });

    Then('run completes again', () => {
      return end;
    });

    When('attempting to signal process again', async () => {
      calledApp = apps.balance();
      end = testHelpers.waitForProcess(calledApp, deploymentName).end();

      response = await request(calledApp)
        .post('/rest/signal/' + token)
        .send({ id: 'wait' });
    });

    Then('bad request is returned since process has completed', () => {
      expect(response.statusCode, response.text).to.equal(400);
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

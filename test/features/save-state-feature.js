import request from 'supertest';

import * as testHelpers from '../helpers/test-helpers.js';
import { MemoryAdapter, STORAGE_TYPE_STATE, StorageError } from '../../src/index.js';

const saveStateResource = testHelpers.getExampleResource('save-state.bpmn');
const disableSaveStateResource = testHelpers.getResource('disable-save-state.bpmn');
const waitResource = testHelpers.getResource('wait.bpmn');

class MisbehavingAdapter extends MemoryAdapter {
  update(type, key, value, options) {
    if (!this._data.has(`${type}:${key}`)) return Promise.reject(new StorageError(`${type}:key not found`, 'MY_OWN_CODE'));
    return this.upsert(type, key, value, options);
  }
}

class AsyncAdapter extends MemoryAdapter {
  constructor(mandatoryProp) {
    super();
    this.mandatoryProp = mandatoryProp;
  }
  upsert(type, key, value, options) {
    if (type === STORAGE_TYPE_STATE) return this.upsertState(type, key, value, options);
    return super.upsert(type, key, value, options);
  }
  upsertState(type, key, value, options) {
    if (this.mandatoryProp && !options?.[this.mandatoryProp]) throw new StorageError(`mandatory ${this.mandatoryProp} is mandatory`);
    return new Promise((resolve, reject) => {
      process.nextTick(async () => {
        try {
          await super.upsert(type, key, value, options);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
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

  Scenario('using saveState service function', () => {
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

  Scenario('autosave is disabled and process run fails', () => {
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
    Given('a source with a script task that throws', async () => {
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
    When('process is started', async () => {
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

  Scenario('process throws and an adapter with builtin reference error when updating', () => {
    /** @type {import('../../types/interfaces.js').IStorageAdapter} */
    let adapter;
    /** @type {ReturnType<testHelpers.horizontallyScaled>} */
    let apps;
    before(() => {
      adapter = new MisbehavingAdapter();
      apps = testHelpers.horizontallyScaled(2, { adapter, autosaveEngineState: true });
    });
    after(() => {
      apps?.stop();
    });

    let deploymentName;
    Given('a source with a bad script', async () => {
      deploymentName = 'volatile-process';

      await testHelpers.createDeployment(
        apps.balance(),
        deploymentName,
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <startEvent id="start">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT0.001S</timeDuration>
              </timerEventDefinition>
            </startEvent>
            <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
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
    When('process is started on app with autosave enabled', async () => {
      calledApp = apps.balance();
      errored = testHelpers.waitForProcess(calledApp, deploymentName).error();

      response = await request(calledApp).post(`/rest/process-definition/${deploymentName}/start`).expect(201);

      token = response.body.id;
    });

    Then('run fails with bad script error', async () => {
      const err = await errored;
      expect(err.message).to.equal('Expected');
    });

    And('engine is not running', () => {
      expect(apps.getRunningByToken(token)).to.have.length(0);
    });

    When('attempting to get state of the failed run', async () => {
      response = await apps.request().get('/rest/state/' + token);
    });

    Then('the failed run state is returned', () => {
      expect(response.statusCode, response.text).to.equal(200);
    });

    When('resuming run', async () => {
      response = await apps
        .request()
        .get('/rest/state/' + token)
        .send({
          id: 'Message_0',
        });
    });
  });

  Scenario('adapter throws on manual save state', () => {
    /** @type {AsyncAdapter} */
    let adapter;
    /** @type {ReturnType<testHelpers.horizontallyScaled>} */
    let apps;
    before(() => {
      adapter = new AsyncAdapter('prop');
      apps = testHelpers.horizontallyScaled(2, { adapter, autosaveEngineState: false });
    });
    after(() => {
      apps?.stop();
    });

    let deploymentName;
    Given('a source matching scenario is deployed', async () => {
      deploymentName = 'async-save-state-process';

      await testHelpers.createDeployment(apps.balance(), deploymentName, saveStateResource);
    });

    let errored;
    let app;
    let token;
    let response;
    When('process is started with monitoring of middleware broker', async () => {
      app = apps.balance();
      errored = testHelpers.waitForProcess(app, deploymentName).error();

      response = await request(app).post(`/rest/process-definition/${deploymentName}/start`).expect(201);

      token = response.body.id;
    });

    Then('run fails with storage error', async () => {
      const err = await errored;
      expect(err.message).to.equal('mandatory prop is mandatory');
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

    Given('a source that throws after manual save and a timer to facilitate tinkering with the adapter', async () => {
      adapter.mandatoryProp = undefined;

      await testHelpers.createDeployment(
        apps.balance(),
        deploymentName,
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <serviceTask id="save" implementation="\${environment.services.saveState}" />
            <sequenceFlow id="to-timer" sourceRef="save" targetRef="timer" />
            <intermediateCatchEvent id="timer">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT10S</timeDuration>
              </timerEventDefinition>
            </intermediateCatchEvent>
            <sequenceFlow id="to-task" sourceRef="timer" targetRef="task" />
            <scriptTask id="task" scriptFormat="javascript">
              <script>next(new Error('Expected'));</script>
            </scriptTask>
          </process>
        </definitions>`
      );
    });

    let timer;
    When('process is started', async () => {
      app = apps.balance();
      timer = testHelpers.waitForProcess(app, deploymentName).timer();

      response = await request(app).post(`/rest/process-definition/${deploymentName}/start`).expect(201);

      token = response.body.id;
    });

    let timerMsg;
    Then('timer is started', async () => {
      timerMsg = await timer;
    });

    Given('adapter is changed so that it will throw', () => {
      adapter.mandatoryProp = 'mandatory';
    });

    const messages = [];
    const emittedErrors = [];
    And('monitoring middleware broker for engine errors and app for emitted errors', () => {
      app.locals.broker.subscribeTmp(
        app.locals.middleware.middleware.name,
        'engine.error',
        (_, msg) => {
          messages.push(msg);
        },
        { noAck: true }
      );

      app.on('bpmn/error', (err) => emittedErrors.push(err));
    });

    When('timer times out', () => {
      errored = testHelpers.waitForProcess(app, token).error();

      const [engine] = apps.getRunningByToken(token);
      engine.environment.timers.executing.find((t) => t.owner.id === timerMsg.content.id).callback();
    });

    Then('run fails', () => {
      return errored;
    });

    And('only error related to bpmn engine run error was published', () => {
      expect(messages).to.have.length(1);
      expect(messages[0].content.message).to.equal('Expected');
    });

    And('storage error was emitted on app', () => {
      const [, err] = emittedErrors;
      expect(err.message).to.equal('mandatory mandatory is mandatory');
    });
  });
});

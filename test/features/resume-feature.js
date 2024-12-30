import request from 'supertest';

import * as testHelpers from '../helpers/test-helpers.js';
import { MemoryAdapter, STORAGE_TYPE_STATE, StorageError } from '../../src/index.js';

const saveStateResource = testHelpers.getExampleResource('save-state.bpmn');

class MyStorageAdapter extends MemoryAdapter {
  update(type, key, value, options) {
    this.assertStateAndMandatoryProps(type, options);
    return super.update(type, key, value, options);
  }
  upsert(type, key, value, options) {
    this.assertStateAndMandatoryProps(type, options);
    return super.upsert(type, key, value, options);
  }
  fetch(type, key, options) {
    this.assertStateAndMandatoryProps(type, options);
    return super.fetch(type, key, options);
  }
  assertStateAndMandatoryProps(type, options) {
    if (type === STORAGE_TYPE_STATE && !options?.mandatoryProp)
      throw new StorageError('cannot use adapter if mandatory prop is not present');
  }
}

Feature('resume from state', () => {
  Scenario('adapter with special needs', () => {
    /** @type {MemoryAdapter} */
    let adapter;
    /** @type {ReturnType<testHelpers.horizontallyScaled>} */
    let apps;
    /** @type {ReturnType<testHelpers.horizontallyScaled>} */
    let appsWithAutosave;
    before(() => {
      adapter = new MyStorageAdapter();
      apps = testHelpers.horizontallyScaled(2, { autosaveEngineState: false, adapter });
    });
    after(() => {
      apps?.stop();
    });

    let deploymentName;
    Given('a source matching scenario is deployed', async () => {
      deploymentName = 'save-state-with-props';
      await testHelpers.createDeployment(apps.balance(), deploymentName, saveStateResource);
    });

    let startingApp;
    let timer;
    let token;
    let response;
    When('process is started with disabled auto save state', async () => {
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

    let signalApp;
    When('attempting to signal message event without any query parameters', async () => {
      signalApp = apps.balance();
      response = await request(signalApp)
        .post('/rest/signal/' + token)
        .send({
          id: 'Message_0',
        });
    });

    Then('bad request is returned since adapter has special needs', () => {
      expect(response.statusCode, response.text).to.equal(502);
      expect(response.body.message).to.match(/cannot use adapter/);
    });

    When('signalling message event with mandatory adapter props as query parameters', async () => {
      completed = testHelpers.waitForProcess(signalApp, deploymentName).end();

      response = await request(signalApp)
        .post('/rest/signal/' + token)
        .query({ mandatoryProp: true })
        .send({
          id: 'Message_0',
        });
    });

    Then('resumed run completes', () => {
      return completed;
    });

    describe('auto-save is enabled', () => {
      Given('a new middleware is added with auto save enabled and engine settings addressing save state', () => {
        appsWithAutosave = testHelpers.horizontallyScaled(2, {
          adapter,
          autosaveEngineState: true,
          engineOptions: {
            settings: {
              saveEngineStateOptions: {
                mandatoryProp: true,
              },
            },
          },
        });
      });

      When('process is started', async () => {
        startingApp = appsWithAutosave.balance();
        timer = testHelpers.waitForProcess(startingApp, deploymentName).timer();

        response = await request(startingApp).post(`/rest/process-definition/${deploymentName}/start`).expect(201);

        token = response.body.id;
      });

      Then('timer is started', () => {
        return timer;
      });

      When('timer times out', () => {
        const [engine] = appsWithAutosave.getRunningByToken(token);
        completed = engine.waitFor('end');
        const timer = engine.environment.timers.executing.find((t) => t.owner.id === 'timeout');
        timer.callback();
      });

      Then('run completes by termination event', () => {
        return completed;
      });

      When('signalling message event with mandatory adapter props as query parameters', async () => {
        signalApp = appsWithAutosave.balance();

        completed = testHelpers.waitForProcess(signalApp, deploymentName).end();

        response = await request(signalApp)
          .post('/rest/signal/' + token)
          .query({ mandatoryProp: true })
          .send({
            id: 'Message_0',
          });
      });

      Then('bad request is returned', () => {
        expect(response.statusCode, response.text).to.equal(400);
      });
    });
  });
});

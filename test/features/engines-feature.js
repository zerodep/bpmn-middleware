import request from 'supertest';

import * as testHelpers from '../helpers/testHelpers.js';
import { MemoryAdapter } from '../../src/index.js';

const saveStateResource = testHelpers.getExampleResource('save-state.bpmn');

Feature('engines', () => {
  Scenario('engine cache option is passed', () => {
    /** @type {MemoryAdapter} */
    let adapter;
    let apps;
    before(() => {
      adapter = new MemoryAdapter();
    });
    after(() => {
      apps?.stop();
    });

    Given('apps are started with option maxRunning engines 5', () => {
      apps = testHelpers.horizontallyScaled(2, { adapter, autosaveEngineState: false, maxRunning: 5 });
    });

    let deploymentName;
    Given('a process is deployed', async () => {
      deploymentName = 'manual-save-state';
      await testHelpers.createDeployment(apps.balance(), deploymentName, saveStateResource);
    });

    let startingApp;
    let stopped;
    const tokens = new Set();
    When('11 processes are started on one app', async () => {
      startingApp = apps.balance();

      stopped = testHelpers.waitForProcess(startingApp, deploymentName).stop();

      for (let i = 0; i < 11; i++) {
        const r = await request(startingApp).post(`/rest/process-definition/${deploymentName}/start`).expect(201);
        tokens.add(r.body.id);
      }
    });

    Then('only 10 are running', async () => {
      const engineCache = startingApp.locals.engineCache;
      await stopped;
      expect(engineCache.size).to.equal(5);
    });
  });
});

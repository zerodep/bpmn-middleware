import * as testHelpers from '../helpers/testHelpers.js';
import { MemoryAdapter } from '../../src/index.js';

const timersResource = testHelpers.getResource('timers.bpmn');

Feature('timers', () => {
  /** @type {MemoryAdapter} */
  let adapter;
  /** @type {ReturnType<testHelpers.horizontallyScaled>} */
  let apps;
  before(() => {
    adapter = new MemoryAdapter();
    apps = testHelpers.horizontallyScaled(2, { adapter });
  });
  after(() => {
    apps?.stop();
  });

  Scenario('source with different type of timers', () => {
    let deploymentName;
    Given('a source matching scenario is deployed', async () => {
      deploymentName = 'multiple-timers';
      await testHelpers.createDeployment(apps.balance(), deploymentName, timersResource);
    });

    let response;
    When('timers are fetched', async () => {
      response = await apps.request().get(`/rest/timers/${deploymentName}`).expect(200);
    });

    Then('timers are returned', () => {
      expect(response.body).to.have.property('timers').with.length(5);
    });

    And('each timer has expected properties', () => {
      let success = 0;
      for (const timer of response.body.timers) {
        if (timer.success) {
          success++;
          expect(timer, timer.id).to.have.property('expireAt').that.is.ok;
          expect(timer, timer.id).to.have.property('delay').that.is.a('number');
        } else {
          expect(timer, timer.id).to.have.property('message').that.is.ok;
        }
      }

      expect(success, 'successful parse').to.be.above(0);
    });
  });
});

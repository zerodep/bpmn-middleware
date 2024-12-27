import request from 'supertest';

import { MemoryAdapter } from '../../src/index.js';
import { createDeployment, horizontallyScaled, getResource, waitForProcess } from '../helpers/test-helpers.js';

const servicesSource = getResource('services.bpmn');

Feature('services', () => {
  Scenario('pass Services factory option', () => {
    let apps, adapter;
    before(() => {
      adapter = new MemoryAdapter();
    });
    after(() => apps?.stop());

    const deploymentName = 'services-process';
    let servicesArgs;
    Given('apps are started with Service factory option', () => {
      apps = horizontallyScaled(2, {
        adapter,
        Services(_adapter, _deploymentName, businessKey) {
          servicesArgs = [_adapter, deploymentName, businessKey];

          if (businessKey !== 'foo') return;

          this.addService('myService', function myService(...args) {
            args.pop()();
          });
        },
      });
    });

    And('a process with service tasks and a wait task is deployed', () => {
      return createDeployment(apps.balance(), deploymentName, servicesSource);
    });

    let app;
    let wait;
    let token;
    When('process is started with business key', async () => {
      app = apps.balance();
      wait = waitForProcess(app, deploymentName).wait();

      const response = await request(app).post(`/rest/process-definition/${deploymentName}/start`).send({ businessKey: 'foo' }).expect(201);
      token = response.body.id;
    });

    let waitMsg;
    Then('run waits for task', async () => {
      waitMsg = await wait;
    });

    And('Services factory was called with the expected arguments', () => {
      expect(servicesArgs).to.deep.equal([adapter, deploymentName, 'foo']);
    });

    let end;
    When('waiting task is signalled from same api instance', async () => {
      end = waitForProcess(app, deploymentName).end();

      await request(app).post(`/rest/signal/${token}`).send({ id: waitMsg.content.id }).expect(200);
    });

    Then('run completes', () => {
      return end;
    });

    When('process is started again with same business key', async () => {
      app = apps.balance();
      wait = waitForProcess(app, deploymentName).wait();

      const response = await request(app).post(`/rest/process-definition/${deploymentName}/start`).send({ businessKey: 'foo' }).expect(201);
      token = response.body.id;
    });

    Then('run waits for task', async () => {
      waitMsg = await wait;
    });

    When('waiting task is signalled from another api instance', async () => {
      app = apps.balance();
      end = waitForProcess(app, deploymentName).end();

      await request(app).post(`/rest/signal/${token}`).send({ id: waitMsg.content.id }).expect(200);
    });

    Then('resumed run completes', () => {
      return end;
    });
  });
});

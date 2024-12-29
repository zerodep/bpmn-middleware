import request from 'supertest';
import { LRUCache } from 'lru-cache';

import { getAppWithExtensions, createDeployment, waitForProcess } from '../helpers/test-helpers.js';
import { MemoryAdapter } from '../../src/index.js';

Feature('memory adapter', () => {
  Scenario('built in memory adapter', () => {
    let app1, app2, storage;
    after(() => {
      return Promise.all([
        request(app1).delete('/rest/internal/stop').expect(204),
        request(app2).delete('/rest/internal/stop').expect(204),
      ]);
    });

    Given('two parallel app instances with a shared adapter storage', () => {
      storage = new LRUCache({ max: 100 });
      const adapter1 = new MemoryAdapter(storage);
      const adapter2 = new MemoryAdapter(storage);

      app1 = getAppWithExtensions({ adapter: adapter1 });
      app2 = getAppWithExtensions({ adapter: adapter2 });
    });

    And('a process with a user task with a non-interrupting bound timeout', () => {
      return createDeployment(
        app2,
        'memory-adapter',
        `<?xml version="1.0" encoding="UTF-8"?>
          <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <process id="bp" isExecutable="true">
              <userTask id="task" />
              <boundaryEvent id="bound-timer" attachedToRef="task" cancelActivity="false">
                <timerEventDefinition>
                  <timeDuration xsi:type="tFormalExpression">PT10S</timeDuration>
                </timerEventDefinition>
              </boundaryEvent>
            </process>
          </definitions>`
      );
    });

    let response, bp;
    When('process is started', async () => {
      response = await request(app1).post('/rest/process-definition/memory-adapter/start').expect(201);

      bp = response.body;
    });

    Then('process status is running timer', async () => {
      response = await request(app2).get(`/rest/status/${bp.id}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('state', 'running');
      expect(response.body).to.have.property('activityStatus', 'timer');
      expect(response.body).to.have.property('expireAt').that.is.ok;
    });

    Given('process run is stopped', () => {
      return request(app1).delete(`/rest/internal/stop/${bp.id}`).expect(204);
    });

    When('process status is fetched', async () => {
      response = await request(app2).get(`/rest/status/${bp.id}`);
    });

    Then('status is still running', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('state', 'running');
      expect(response.body).to.have.property('activityStatus', 'timer');
      expect(response.body).to.have.property('expireAt').that.is.ok;
    });

    let end;
    When('process user task is signaled', () => {
      end = waitForProcess(app2, bp.id).end();
      return request(app2).post(`/rest/signal/${bp.id}`).send({ id: 'task' }).expect(200);
    });

    Then('run completes', () => {
      return end;
    });

    And('first app also has the completed process', async () => {
      response = await request(app1).get(`/rest/status/${bp.id}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('state', 'idle');
    });

    When('second app signals the completed process', async () => {
      response = await request(app2).post(`/rest/signal/${bp.id}`).send({ id: 'task' });
    });

    Then('bad request is returned with completed message', () => {
      expect(response.statusCode, response.text).to.equal(400);
      expect(response.body)
        .to.have.property('message')
        .that.match(/completed/i);
    });

    When('first app attempts to signal the completed process', async () => {
      response = await request(app2).post(`/rest/signal/${bp.id}`).send({ id: 'task' });
    });

    Then('bad request is returned with completed message', () => {
      expect(response.statusCode, response.text).to.equal(400);
      expect(response.body)
        .to.have.property('message')
        .that.match(/completed/i);
    });

    Given('the state is purged', () => {
      storage.delete(`state:${bp.id}`);
    });

    When('first app attempts to signal the completed process', async () => {
      response = await request(app2).post(`/rest/signal/${bp.id}`).send({ id: 'task' });
    });

    Then('not found is returned', () => {
      expect(response.statusCode, response.text).to.equal(404);
    });

    When('process is ran again', async () => {
      response = await request(app1).post('/rest/process-definition/memory-adapter/start').expect(201);

      bp = response.body;
    });
  });
});

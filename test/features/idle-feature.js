import request from 'supertest';
import * as ck from 'chronokinesis';
import { LRUCache } from 'lru-cache';

import { getAppWithExtensions, createDeployment, waitForProcess } from '../helpers/testHelpers.js';
import { MemoryAdapter } from '../../src/index.js';
import { DEFAULT_IDLE_TIMER } from '../../src/constants.js';

Feature('idle engine', () => {
  after(ck.reset);
  before(ck.travel);

  Scenario('engine execution stops when idle timeout occur', () => {
    let app1, app2, storage;
    after(() => {
      return Promise.all([
        request(app1).delete('/rest/internal/stop').expect(204),
        request(app2).delete('/rest/internal/stop').expect(204),
      ]);
    });

    Given('two parallel app instances with a shared adapter source', () => {
      storage = new LRUCache({ max: 100 });
      const adapter1 = new MemoryAdapter(storage);
      const adapter2 = new MemoryAdapter(storage);

      app1 = getAppWithExtensions({ adapter: adapter1 });
      app2 = getAppWithExtensions({ adapter: adapter2 });
    });

    And('a process with a user task with a long running non-interrupting bound timeout', () => {
      return createDeployment(
        app2,
        'idle-engine',
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <userTask id="task" />
            <boundaryEvent id="bound-timer" attachedToRef="task" cancelActivity="false">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT10M</timeDuration>
              </timerEventDefinition>
            </boundaryEvent>
          </process>
        </definitions>`,
      );
    });

    let response, bp;
    When('process is started', async () => {
      response = await request(app1).post('/rest/process-definition/idle-engine/start').expect(201);

      bp = response.body;
    });

    Then('process status is timer with expire at', async () => {
      response = await request(app2).get(`/rest/status/${bp.id}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('activityStatus', 'timer');
      expect(response.body).to.have.property('expireAt');
    });

    let stopped;
    When('idle timeout has passed', () => {
      ck.travel(Date.now() + DEFAULT_IDLE_TIMER);
      stopped = waitForProcess(app1, bp.id).stop();
      return waitForProcess(app1, bp.id).idle();
    });

    Then('execution is considered idle and stopped', () => {
      return stopped;
    });

    let expireAt;
    And('status is still running with expire date', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('state', 'running');
      expect(response.body).to.have.property('activityStatus', 'timer');
      expect(response.body).to.have.property('expireAt').that.is.ok;
      expireAt = response.body.expireAt;
    });

    When('process is resumed close to timer timeout', () => {
      ck.travel(new Date(expireAt) - 2 * DEFAULT_IDLE_TIMER + 1000);

      return request(app2).post(`/rest/resume/${bp.id}`).expect(200);
    });

    Then('status is still running with expire date', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('state', 'running');
      expect(response.body).to.have.property('activityStatus', 'timer');
      expect(response.body).to.have.property('expireAt').that.is.ok;
    });

    When('idle timeout has passed', () => {
      ck.travel(Date.now() + DEFAULT_IDLE_TIMER);
      return waitForProcess(app2, bp.id).idle();
    });

    Then('app is still running process since timeout is close', () => {
      expect(app2.locals.engineCache.get(bp.id)).to.be.ok;
    });

    let end;
    When('user task is signalled', () => {
      end = waitForProcess(app2, bp.id).end();
      return request(app2).post(`/rest/signal/${bp.id}`).send({ id: 'task' }).expect(200);
    });

    Then('run completes', () => {
      return end;
    });
  });

  Scenario('long running service task', () => {
    let app;
    after(() => {
      return request(app).delete('/rest/internal/stop').expect(204);
    });

    const serviceCalls = [];
    Given('an app instances', () => {
      app = getAppWithExtensions({
        engineOptions: {
          services: {
            get(...args) {
              serviceCalls.push(args);
            },
          },
        },
      });
    });

    And('a process with a long running service task and a bound timer', () => {
      return createDeployment(
        app,
        'long-running-service',
        `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp" isExecutable="true">
          <serviceTask id="task" implementation="\${environment.services.get}" />
          <boundaryEvent id="bound-timer" attachedToRef="task">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">PT10M</timeDuration>
            </timerEventDefinition>
          </boundaryEvent>
        </process>
      </definitions>`,
      );
    });

    let response, bp;
    When('process is started', async () => {
      response = await request(app).post('/rest/process-definition/long-running-service/start').expect(201);

      bp = response.body;
    });

    Then('activity status is executing and expire at is set to timer', async () => {
      response = await request(app).get(`/rest/status/${bp.id}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('activityStatus', 'executing');
      expect(response.body).to.have.property('expireAt').that.is.ok;
    });

    When('idle timeout has passed', () => {
      ck.travel(Date.now() + DEFAULT_IDLE_TIMER);
      return waitForProcess(app, bp.id).idle();
    });

    Then('app is still running process since it is executing', () => {
      expect(app.locals.engineCache.get(bp.id)).to.be.ok;
    });

    And('state has been saved', async () => {
      response = await request(app).get('/rest/running');

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body.engines).to.have.length(1);
    });

    When('next idle timeout has passed', () => {
      ck.travel(Date.now() + DEFAULT_IDLE_TIMER);
      return waitForProcess(app, bp.id).idle();
    });

    Then('app is still running process since it is executing', () => {
      expect(app.locals.engineCache.get(bp.id)).to.be.ok;
    });

    let end;
    When('long running service completes', () => {
      end = waitForProcess(app, bp.id).end();
      serviceCalls.pop().pop()();
    });

    Then('process completes', () => {
      return end;
    });

    Given('process is modified to just a long running service task', () => {
      return createDeployment(
        app,
        'long-running-service',
        `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp" isExecutable="true">
          <serviceTask id="task" implementation="\${environment.services.get}" />
        </process>
      </definitions>`,
      );
    });

    When('modified process is started', async () => {
      response = await request(app).post('/rest/process-definition/long-running-service/start').expect(201);

      bp = response.body;
    });

    Then('state has been saved', async () => {
      response = await request(app).get('/rest/running');

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body.engines).to.have.length(1);
      expect(response.body.engines[0]).to.have.property('token', bp.id);
      expect(response.body.engines[0]).to.have.property('activityStatus', 'executing');
    });

    And('activity status is executing and nulled expire at', async () => {
      response = await request(app).get(`/rest/status/${bp.id}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('activityStatus', 'executing');
      expect(response.body).to.have.property('expireAt', null);
    });

    When('idle timeout has passed', () => {
      ck.travel(Date.now() + DEFAULT_IDLE_TIMER);
      return waitForProcess(app, bp.id).idle();
    });

    Then('app is still running process since it is executing', () => {
      expect(app.locals.engineCache.get(bp.id)).to.be.ok;
    });

    And('state has been saved', async () => {
      response = await request(app).get('/rest/running');

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body.engines).to.have.length(1);
      expect(response.body.engines[0]).to.have.property('token', bp.id);
      expect(response.body.engines[0]).to.have.property('activityStatus', 'executing');
    });
  });

  Scenario('override idle timeout', () => {
    let app;
    after(() => {
      return request(app).delete('/rest/internal/stop').expect(204);
    });

    const serviceCalls = [];
    Given('an app instances', () => {
      app = getAppWithExtensions({
        engineOptions: {
          services: {
            get(...args) {
              serviceCalls.push(args);
            },
          },
        },
      });
    });

    And('a process with a user task with a long running non-interrupting bound timeout', () => {
      return createDeployment(
        app,
        'override-idle-timeout',
        `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp" isExecutable="true">
          <userTask id="task" />
          <boundaryEvent id="bound-timer" attachedToRef="task" cancelActivity="false">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">PT10M</timeDuration>
            </timerEventDefinition>
          </boundaryEvent>
        </process>
      </definitions>`,
      );
    });

    let response, bp;
    When('process is started with overridden idle timeout', async () => {
      response = await request(app).post('/rest/process-definition/override-idle-timeout/start').send({ idleTimeout: 3000 }).expect(201);

      bp = response.body;
    });

    Then('activity status is executing and expire at is set to timer', async () => {
      response = await request(app).get(`/rest/status/${bp.id}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('activityStatus', 'timer');
      expect(response.body).to.have.property('expireAt').that.is.ok;
    });

    let stopped;
    When('idle timeout has passed', () => {
      ck.travel(Date.now() + 3000);
      stopped = waitForProcess(app, bp.id).stop();
      return waitForProcess(app, bp.id).idle();
    });

    Then('app stops the execution', () => {
      return stopped;
    });

    When('engine is resumed', async () => {
      response = await request(app).post(`/rest/resume/${bp.id}`).expect(200);
    });

    Then('idle timeout is preserved', () => {
      expect(app.locals.engineCache.get(bp.id).idleTimer).to.have.property('delay', 3000);
    });
  });
});

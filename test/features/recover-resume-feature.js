import request from 'supertest';
import * as ck from 'chronokinesis';

import { createDeployment, waitForProcess, horizontallyScaled } from '../helpers/testHelpers.js';

Feature('recover resume', () => {
  after(ck.reset);

  Scenario('two app instances with shared storage', () => {
    let apps;
    before(() => {
      apps = horizontallyScaled(2);
    });
    after(() => {
      return apps.stop();
    });

    Given('a process with one user task with a bound timeout deployed on second app', () => {
      return createDeployment(
        apps.balance(),
        'shared',
        `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp" isExecutable="true">
          <userTask id="task" />
          <boundaryEvent id="bound-timer" attachedToRef="task">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">PT10S</timeDuration>
            </timerEventDefinition>
          </boundaryEvent>
        </process>
      </definitions>`,
      );
    });

    let response, bp;
    When('process is started', async () => {
      response = await apps.request().post('/rest/process-definition/shared/start').expect(201);

      bp = response.body;
    });

    Then('process status is running', async () => {
      response = await apps.request().get(`/rest/status/${bp.id}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('state', 'running');
    });

    let end;
    When('process is signalled', () => {
      const app = apps.balance();
      end = waitForProcess(app, bp.id).end();
      return request(app).post(`/rest/signal/${bp.id}`).send({ id: 'task' }).expect(200);
    });

    Then('run completes', () => {
      return end;
    });

    And('process status is completed', async () => {
      response = await apps.request().get(`/rest/status/${bp.id}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('state', 'idle');
    });

    When('completed process is signalled', async () => {
      response = await apps.request().post(`/rest/signal/${bp.id}`).send({ id: 'task' });
    });

    Then('bad request is returned with message completed', () => {
      expect(response.statusCode, response.text).to.equal(400);
      expect(response.body)
        .to.have.property('message')
        .that.match(/completed/i);
    });

    When('completed process is resumed', async () => {
      response = await apps.request().post(`/rest/resume/${bp.id}`);
    });

    Then('bad request is returned with message completed', () => {
      expect(response.statusCode, response.text).to.equal(400);
      expect(response.body)
        .to.have.property('message')
        .that.match(/completed/i);
    });

    Given('the state is purged', () => {
      apps.storage.delete(`state:${bp.id}`);
    });

    When('attempting to signal the completed process', async () => {
      response = await apps.request().post(`/rest/signal/${bp.id}`).send({ id: 'task' });
    });

    Then('not found is returned', () => {
      expect(response.statusCode, response.text).to.equal(404);
    });
  });

  Scenario('multiple timers', () => {
    let apps;
    after(() => {
      return apps.stop();
    });

    Given('two parallel app instances with a shared adapter source', () => {
      apps = horizontallyScaled(2);
    });

    And('a process with one user task with two bound timeouts deployed on second app', () => {
      return createDeployment(
        apps.balance(),
        'mulitple-timers',
        `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp" isExecutable="true">
          <userTask id="task" />
          <boundaryEvent id="bound-timer-1" attachedToRef="task" cancelActivity="false">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">PT10S</timeDuration>
            </timerEventDefinition>
          </boundaryEvent>
          <boundaryEvent id="bound-timer-2" attachedToRef="task">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">PT30S</timeDuration>
            </timerEventDefinition>
          </boundaryEvent>
        </process>
      </definitions>`,
      );
    });

    let response, bp;
    When('process is started', async () => {
      ck.freeze(2023, 5, 15, 12, 0);
      response = await apps.request().post('/rest/process-definition/mulitple-timers/start').expect(201);

      bp = response.body;
    });

    Then('process status is running', async () => {
      response = await apps.request().get(`/rest/status/${bp.id}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('state', 'running');
    });

    And('expire at is set to closest timer', () => {
      expect(new Date(response.body.expireAt)).to.deep.equal(new Date(Date.now() + 10000));
    });

    let app;
    When('closest timer expire', () => {
      app = apps.balance();
      ck.travel(Date.now() + 10000);
      app.locals.engineCache.get(bp.id).environment.timers.executing[0].callback();
    });

    Then('process status is still running', async () => {
      response = await apps.request().get(`/rest/status/${bp.id}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('state', 'running');
    });

    And('expire at is set to second timer', () => {
      expect(new Date(response.body.expireAt)).to.deep.equal(new Date(Date.now() + 20000));
    });

    let end;
    When('second timer expire', () => {
      end = waitForProcess(app, bp.id).end();
      ck.travel(Date.now() + 10000);
      app.locals.engineCache.get(bp.id).environment.timers.executing[0].callback();
    });

    Then('run completes', () => {
      return end;
    });

    Then('process status can be fetched from second app', async () => {
      response = await apps.request().get(`/rest/status/${bp.id}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('state', 'idle');
    });

    And('expire at is undefined', () => {
      expect(response.body.expireAt).to.be.undefined;
    });
  });

  Scenario('multiple running engines', () => {
    let apps;
    before(() => {
      apps = horizontallyScaled(2);
    });
    after(() => {
      return apps.stop();
    });

    Given('a process with one user task', () => {
      return createDeployment(
        apps.balance(),
        'user-task',
        `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp1" isExecutable="true">
          <userTask id="task" />
        </process>
      </definitions>`,
      );
    });

    And('another process with one manual task with bound timer', () => {
      return createDeployment(
        apps.balance(),
        'manual-task',
        `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp2" isExecutable="true">
          <manualTask id="task" />
          <boundaryEvent id="bound-timer-2" attachedToRef="task">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">PT30S</timeDuration>
            </timerEventDefinition>
          </boundaryEvent>
        </process>
      </definitions>`,
      );
    });

    let response;
    When('user task process is started', () => {
      return apps.request().post('/rest/process-definition/user-task/start').expect(201);
    });

    And('another user task process', () => {
      return apps.request().post('/rest/process-definition/user-task/start').expect(201);
    });

    And('manual task process is started', () => {
      return apps.request().post('/rest/process-definition/manual-task/start').expect(201);
    });

    And('another manual task process is started', () => {
      return apps.request().post('/rest/process-definition/manual-task/start').expect(201);
    });

    Then('four process is started', async () => {
      response = await apps.request().get('/rest/running');

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('engines').with.length(4);
    });

    let running;
    And('running processes has the expected properties', async () => {
      response = await apps.request().get('/rest/running');

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('engines').with.length(4);
      running = response.body.engines;

      for (const status of running) {
        expect(status, status.name).to.have.property('token');
        expect(status, status.name).to.have.property('name');
        expect(status, status.name).to.have.property('state', 'running');
        expect(status, status.name).to.have.property('activityStatus');
        expect(status, status.name).to.have.property('postponed').that.is.an('array');
      }
    });

    And('status of first process is timer', async () => {
      response = await apps.request().get(`/rest/status/${running[0].token}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('activityStatus', 'timer');
    });

    And('as well as second process', async () => {
      response = await apps.request().get(`/rest/status/${running[0].token}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('activityStatus', 'timer');
    });
  });

  Scenario('engine state sequence number', () => {
    let apps;
    before(() => {
      apps = horizontallyScaled(2);
    });
    after(() => {
      return apps.stop();
    });

    Given('a process with two succeeding user tasks and a parallel timer', () => {
      return createDeployment(
        apps.balance(),
        'user-tasks',
        `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp1" isExecutable="true">
          <userTask id="task1" />
          <sequenceFlow id="to-fork" sourceRef="task1" targetRef="fork" />
          <parallelGateway id="fork" />
          <sequenceFlow id="to-task2" sourceRef="fork" targetRef="task2" />
          <sequenceFlow id="to-timer" sourceRef="fork" targetRef="timer" />
          <userTask id="task2" />
          <intermediateThrowEvent id="timer">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">PT30S</timeDuration>
            </timerEventDefinition>
          </intermediateThrowEvent>
        </process>
      </definitions>`,
      );
    });

    let response;
    When('process is started', () => {
      return apps.request().post('/rest/process-definition/user-tasks/start').expect(201);
    });

    And('another process is started', () => {
      return apps.request().post('/rest/process-definition/user-tasks/start').expect(201);
    });

    let running;
    Then('two running process exists', async () => {
      response = await apps.request().get('/rest/running');

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('engines').with.length(2);
      running = response.body.engines;
    });

    And('first process state run sequence number is set', () => {
      expect(running[0]).to.have.property('sequenceNumber', 4);
      expect(running[0]).to.have.property('activityStatus', 'wait');
    });

    When('first process is signaled', async () => {
      response = await apps.request().post(`/rest/signal/${running[0].token}`).send({ id: 'task1' });

      expect(response.statusCode, response.text).to.equal(200);
    });

    Then('two running processes still exists', async () => {
      response = await apps.request().get('/rest/running');

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('engines').with.length(2);
      running = response.body.engines;
    });

    And('first process state run sequence number is updated', () => {
      expect(running[0]).to.have.property('sequenceNumber', 19);
      expect(running[0]).to.have.property('activityStatus', 'timer');
      expect(running[0]).to.have.property('expireAt').that.is.ok;
    });

    And('activity status is timer', async () => {
      response = await apps.request().get(`/rest/status/${running[0].token}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('activityStatus', 'timer');
    });

    When('first process is resumed', async () => {
      response = await apps.request().post(`/rest/resume/${running[0].token}`);

      expect(response.statusCode, response.text).to.equal(200);
    });

    Then('both apps runs process', () => {
      const runningApps = apps.apps;
      expect(runningApps[0].locals.engineCache.get(running[0].token)).to.be.ok;
      expect(runningApps[1].locals.engineCache.get(running[0].token)).to.be.ok;
    });

    When('process completes timer', () => {
      const engine1 = apps.balance().locals.engineCache.get(running[0].token);
      const timer = engine1.environment.timers.executing.find((t) => t.owner.id === 'timer');
      timer.callback();
    });

    Then('two running processes still exists', async () => {
      response = await apps.request().get('/rest/running');

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('engines').with.length(2);
      running = response.body.engines;
    });

    And('first process state run sequence number is updated', () => {
      expect(running[0]).to.have.property('sequenceNumber', 23);
    });

    And('process activity status is wait', () => {
      expect(running[0]).to.have.property('activityStatus', 'wait');
    });

    But('with nulled expire at', () => {
      expect(running[0]).to.have.property('expireAt').that.is.null;
    });
  });

  Scenario('resume non-resumable state', () => {
    let apps;
    before(() => {
      apps = horizontallyScaled(2);
    });
    after(() => {
      return apps.stop();
    });

    Given('a process with two succeeding user tasks and a parallel timer', () => {
      return createDeployment(
        apps.balance(),
        'user-tasks',
        `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp1" isExecutable="true">
          <userTask id="task1" />
        </process>
      </definitions>`,
      );
    });

    let app, response;
    When('process is started', () => {
      app = apps.balance();
      return request(app).post('/rest/process-definition/user-tasks/start').expect(201);
    });

    And('another process is started', () => {
      return apps.request().post('/rest/process-definition/user-tasks/start').expect(201);
    });

    let running;
    Then('two running process exists', async () => {
      response = await apps.request().get('/rest/running');

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('engines').with.length(2);
      running = response.body.engines;
    });

    When('first process state is deleted', async () => {
      response = await apps.request().delete(`/rest/state/${running[0].token}`).expect(204);
    });

    Then('one running processes still exists', async () => {
      response = await apps.request().get('/rest/running');

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('engines').with.length(1);
    });

    When('attempting to resume first process', async () => {
      response = await apps.request().post(`/rest/resume/${running[0].token}`);
    });

    Then('not found is returned', () => {
      expect(response.statusCode, response.text).to.equal(404);
      expect(response.body.message).to.match(/Token .+? not found/i);
    });
  });
});

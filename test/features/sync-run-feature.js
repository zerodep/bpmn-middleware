import request from 'supertest';
import ck from 'chronokinesis';

import { createDeployment, getExampleApp, getResource, waitForProcess, getExampleResource } from '../helpers/test-helpers.js';

const waitResource = getResource('wait.bpmn');
const taskResource = getExampleResource('task.bpmn');

Feature('sync run', () => {
  let app;
  before('example app is started', async () => {
    app = await getExampleApp();
    await createDeployment(app, 'wait-process', waitResource);
  });
  afterEachScenario(() => {
    ck.reset();
    app.emit('bpmn/stop-all');
  });

  Scenario('a simple source with output', () => {
    let deploymentName;
    Given('a process with a task with output', () => {
      deploymentName = 'output-process';
      return createDeployment(app, deploymentName, taskResource);
    });

    let response;
    When('process is started in sync', async () => {
      response = await request(app).post(`/rest/process-definition/${deploymentName}/start`).query({ sync: true });
    });

    Then('output is returned', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('id').that.is.a('string');
      expect(response.body).to.have.property('result').that.deep.equal({ foo: 'bar' });
    });
  });

  Scenario('run with idle timeout', () => {
    let deploymentName;
    Given('a process that waits for user input', () => {
      deploymentName = 'wait-process';
    });

    let pendinResponse;
    let wait;
    When('process is started in sync', () => {
      wait = waitForProcess(app, deploymentName).wait();

      pendinResponse = request(app)
        .post(`/rest/process-definition/${deploymentName}/start`)
        .query({ sync: true })
        .then((res) => res);
    });

    let token;
    let waitingMsg;
    Then('run is waiting', async () => {
      waitingMsg = await wait;
      token = waitingMsg.properties.token;
    });

    And('an idle timer is started with default delay of 60s', () => {
      const engine = app.locals.engines.getByToken(token);

      expect(engine.idleTimer.delay).to.equal(60000);
    });

    When('something signals waiting task', () => {
      return request(app).post(`/rest/signal/${token}`).send({ id: waitingMsg.content.id, foo: 'bar' });
    });

    Then('output is returned', async () => {
      const response = await pendinResponse;
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('id').that.is.a('string');
      expect(response.body).to.have.property('result').with.property('signal').that.deep.equal({ id: waitingMsg.content.id, foo: 'bar' });
    });

    When('starting again with idle timeout of 30s', () => {
      wait = waitForProcess(app, deploymentName).wait();

      pendinResponse = request(app)
        .post(`/rest/process-definition/${deploymentName}/start`)
        .query({ sync: true, IdleTimeout: 30000 })
        .then((res) => res);
    });

    Then('run is waiting', async () => {
      waitingMsg = await wait;
      token = waitingMsg.properties.token;
    });

    let idleTimer;
    And('an idle timer is started with delay of 30s', () => {
      const engine = app.locals.engines.getByToken(token);

      idleTimer = engine.idleTimer;

      expect(idleTimer.delay).to.equal(30000);
    });

    When('idle timer times out', () => {
      idleTimer.callback();
    });

    let response;
    Then('response is gateway timeout', async () => {
      response = await pendinResponse;
      expect(response.statusCode, response.text).to.equal(504);
      expect(response.body.message, response.text).to.match(/timed out/i);
    });

    When('attempting to signal timed out engine', async () => {
      response = await request(app).post(`/rest/signal/${token}`).send({ id: waitingMsg.content.id });
    });

    Then('bad request is returned since the engine run failed due to timeout', () => {
      expect(response.statusCode, response.text).to.equal(400);
      expect(response.text).to.match(/failed/);
    });

    When('starting again with idle timeout of PT15S', () => {
      wait = waitForProcess(app, deploymentName).wait();

      pendinResponse = request(app)
        .post(`/rest/process-definition/${deploymentName}/start`)
        .query({ sync: true, idletimeout: 'PT15S' })
        .then((res) => res);
    });

    Then('run is waiting', async () => {
      waitingMsg = await wait;
      token = waitingMsg.properties.token;
    });

    And('an idle timer is started with delay of 15s', () => {
      const engine = app.locals.engines.getByToken(token);

      idleTimer = engine.idleTimer;

      expect(idleTimer.delay).to.equal(15000);
    });

    When('idle timer times out', () => {
      idleTimer.callback();
    });

    Then('response is gateway timeout', async () => {
      const response = await pendinResponse;
      expect(response.statusCode, response.text).to.equal(504);
      expect(response.body.message, response.text).to.match(/timed out/i);
    });

    Given('a process that with a long running script task', () => {
      deploymentName = 'forever-script-process';
      return createDeployment(
        app,
        deploymentName,
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <scriptTask id="task" scriptFormat="javascript">
              <script>const foo="bar";</script>
            </scriptTask>
          </process>
        </definitions>`
      );
    });

    let startActivity;
    When('starting long running script task process', () => {
      startActivity = waitForProcess(app, deploymentName).startActivity();

      pendinResponse = request(app)
        .post(`/rest/process-definition/${deploymentName}/start`)
        .query({ sync: true, IdleTimeout: 30000 })
        .then((res) => res);
    });

    Then('idle timer is started', async () => {
      await startActivity;

      const [engine] = app.locals.engines.running;

      idleTimer = engine.idleTimer;

      expect(idleTimer.delay).to.equal(30000);
    });

    When('idle timer times out', () => {
      idleTimer.callback();
    });

    Then('response is gateway timeout', async () => {
      const response = await pendinResponse;
      expect(response.statusCode, response.text).to.equal(504);
      expect(response.body.message, response.text).to.match(/timed out/i);
    });

    Given('a process that with a start timer with duration beyond idle timeout', () => {
      deploymentName = 'long-running-timer-process';
      return createDeployment(
        app,
        deploymentName,
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <startEvent id="start">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT1H</timeDuration>
              </timerEventDefinition>
            </startEvent>
          </process>
        </definitions>`
      );
    });

    let startTimer;
    When('starting long running start timer process', () => {
      startTimer = waitForProcess(app, deploymentName).timer();

      pendinResponse = request(app)
        .post(`/rest/process-definition/${deploymentName}/start`)
        .query({ sync: true, IdleTimeout: 30000 })
        .then((res) => res);
    });

    Then('idle timer is started', async () => {
      await startTimer;
      const [engine] = app.locals.engines.running;

      idleTimer = engine.idleTimer;

      expect(idleTimer.delay).to.equal(30000);
    });

    When('idle timer times out', () => {
      idleTimer.callback();
    });

    Then('response is gateway timeout', async () => {
      const response = await pendinResponse;
      expect(response.statusCode, response.text).to.equal(504);
      expect(response.body.message, response.text).to.match(/timed out/i);
    });
  });

  Scenario('signal run in sync', () => {
    const deploymentName = 'wait-process';

    let wait;
    When('process with waiting task started in async', () => {
      wait = waitForProcess(app, deploymentName).wait();

      return request(app).post(`/rest/process-definition/${deploymentName}/start`);
    });

    let token;
    let waitingMsg;
    Then('run is waiting', async () => {
      waitingMsg = await wait;
      token = waitingMsg.properties.token;
    });

    let stopped;
    When('idle timer times out', () => {
      stopped = waitForProcess(app, token).stop();
      waitForProcess(app, token).idle(true);
    });

    Then('run is stopped', () => {
      return stopped;
    });

    let pendingResponse;
    When('run is signalled with sync', () => {
      pendingResponse = request(app)
        .post(`/rest/signal/${token}`)
        .query({ sync: true, idletimeout: 'PT15S' })
        .send({ id: waitingMsg.content.id, foo: 'bar' })
        .then((res) => res);
    });

    let response;
    Then('response has result from process', async () => {
      response = await pendingResponse;

      expect(response.statusCode, response.text).to.equal(200);

      expect(response.body).to.have.property('token', token);
      expect(response.body)
        .to.have.property('result')
        .that.deep.equal({ signal: { id: waitingMsg.content.id, foo: 'bar' } });
    });

    When('attempting to signal run again', async () => {
      response = await request(app)
        .post(`/rest/signal/${token}`)
        .query({ sync: true, idletimeout: 'PT15S' })
        .send({ id: waitingMsg.content.id, foo: 'bar' });
    });

    Then('bad request is returned since run completed', () => {
      expect(response.statusCode, response.text).to.equal(400);
      expect(response.text).to.match(/completed/);
    });

    Given('process is started in async again with intent to signal', () => {
      wait = waitForProcess(app, deploymentName).wait();

      return request(app).post(`/rest/process-definition/${deploymentName}/start`);
    });

    And('run is stopped and state is saved', async () => {
      waitingMsg = await wait;
      token = waitingMsg.properties.token;
      stopped = waitForProcess(app, token).stop();
      waitForProcess(app, token).idle(true);
      return stopped;
    });

    When('run is signalled with an unknown activity id in sync with idle timeout', () => {
      wait = waitForProcess(app, token).wait();

      pendingResponse = request(app)
        .post(`/rest/signal/${token}`)
        .send({ id: 'whoami?' })
        .query({ sync: true, idletimeout: 'PT2S' })
        .then((res) => res);
    });

    Then('signalled run has an idle timer with expected delay', async () => {
      await wait;

      const idleTimer = await waitForProcess(app, token).idle(true);

      expect(idleTimer.delay).to.equal(2000);
    });

    When('run stopped due to idle timer', () => {
      // no-op
    });

    Then('gateway timeout is returned', async () => {
      response = await pendingResponse;
      expect(response.statusCode, response.text).to.equal(504);
    });
  });

  Scenario('a parallel signal call to running engine', () => {
    const deploymentName = 'wait-process';

    let wait;
    When('process with waiting task is started in async', () => {
      wait = waitForProcess(app, deploymentName).wait();

      return request(app).post(`/rest/process-definition/${deploymentName}/start`).expect(201);
    });

    let token;
    let waitingMsg;
    Then('run is waiting', async () => {
      waitingMsg = await wait;
      token = waitingMsg.properties.token;
    });

    let response;
    When('run is signalled with sync while running on the same app', async () => {
      response = await request(app).post(`/rest/signal/${token}`).query({ sync: true }).send({ id: waitingMsg.content.id, foo: 'bar' });
    });

    Then('response has result from process', () => {
      expect(response.statusCode, response.text).to.equal(200);

      expect(response.body).to.have.property('token', token);
      expect(response.body)
        .to.have.property('result')
        .that.deep.equal({ signal: { id: waitingMsg.content.id, foo: 'bar' } });
    });

    When('attempting to signal run again', async () => {
      response = await request(app)
        .post(`/rest/signal/${token}`)
        .query({ sync: true, idletimeout: 'PT15S' })
        .send({ id: waitingMsg.content.id, foo: 'bar' });
    });

    Then('bad request is returned since run completed', () => {
      expect(response.statusCode, response.text).to.equal(400);
      expect(response.text).to.match(/completed/);
    });
  });

  Scenario('resume run in sync', () => {
    let timer;
    let token;
    let stopped;
    Given('a process with a start timer is started, saved state, and is stopped', async () => {
      await createDeployment(
        app,
        'start-timer-process',
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions id="timer-def" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <startEvent id="start">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT1M</timeDuration>
              </timerEventDefinition>
            </startEvent>
            <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
            <scriptTask id="task" scriptFormat="javascript" camunda:resultVariable="foo">
              <script>next(null, "bar");</script>
            </scriptTask>
          </process>
        </definitions>`
      );

      timer = waitForProcess(app, 'start-timer-process').timer();

      await request(app).post(`/rest/process-definition/start-timer-process/start?sync=false&idletimeout=PT5S`).expect(201);

      const timerMsg = await timer;
      token = timerMsg.properties.token;

      stopped = waitForProcess(app, token).stop();

      waitForProcess(app, token).idle(true);

      return stopped;
    });

    let pendingResponse;
    When('start timer is still running beyond passed idle timeout', () => {
      ck.travel(Date.now() + 30000);

      timer = waitForProcess(app, token).timer();

      pendingResponse = request(app)
        .post(`/rest/resume/${token}`)
        .query({ sync: true, idletimeout: 'PT10S' })
        .then((res) => res);
    });

    And('resumed run times out', async () => {
      await timer;
      return waitForProcess(app, token).idle(true);
    });

    let response;
    Then('gateway timeout is returned', async () => {
      response = await pendingResponse;
      expect(response.statusCode, response.text).to.equal(504);
    });

    When('clock has passed start timer and run is resumed in sync', async () => {
      ck.travel(Date.now() + 30001);
      response = await request(app).post(`/rest/resume/${token}?sync&idleTimeout=PT10S`);
    });

    Then('run completed and output is returned in response', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('token', token);
      expect(response.body.result).to.deep.equal({ foo: 'bar' });
    });

    let wait;
    Given('process with a waiting task is started in async with custom idle timeout, saves state, and is stopped', async () => {
      wait = waitForProcess(app, 'wait-process').wait();

      await request(app).post(`/rest/process-definition/wait-process/start?idletimeout=PT10S`);

      const waitingMsg = await wait;
      token = waitingMsg.properties.token;
      stopped = waitForProcess(app, token).stop();

      waitForProcess(app, token).idle(true);

      return stopped;
    });

    When('run is resumed in sync with idle timeout', () => {
      wait = waitForProcess(app, token).wait();

      pendingResponse = request(app)
        .post(`/rest/resume/${token}`)
        .query({ sync: true, idletimeout: 'PT2S' })
        .then((res) => res);
    });

    Then('resumed run has an idle timer with expected delay', async () => {
      await wait;

      const idleTimer = await waitForProcess(app, token).idle(true);

      expect(idleTimer.delay).to.equal(2000);
    });

    When('run stopped due to idle timer', () => {
      // no-op
    });

    Then('gateway timeout is returned', async () => {
      const response = await pendingResponse;
      expect(response.statusCode, response.text).to.equal(504);
    });

    When('run is resumed async without idle timeout', async () => {
      wait = waitForProcess(app, token).wait();

      response = await request(app)
        .post(`/rest/resume/${token}`)
        .then((res) => res);
    });

    let waitingMsg;
    Then('resumed run has an idle timer with delay from when started', async () => {
      waitingMsg = await wait;

      const [engine] = app.locals.engines.running;

      expect(engine.idleTimer.delay).to.equal(10000);
    });

    let end;
    When('run is signalled async', () => {
      end = waitForProcess(app, token).end();
      return request(app).post(`/rest/signal/${token}`).send({ id: waitingMsg.content.id }).expect(200);
    });

    Then('run completes', () => {
      return end;
    });
  });

  Scenario('run fails', () => {
    let deploymentName;
    Given('a process that with a script task that fails', () => {
      deploymentName = 'failing-script-process';
      return createDeployment(
        app,
        deploymentName,
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <scriptTask id="task" scriptFormat="javascript">
              <script>next(new Error('Expected error'));</script>
            </scriptTask>
          </process>
        </definitions>`
      );
    });

    let response;
    When('process is started in sync', async () => {
      response = await request(app).post(`/rest/process-definition/${deploymentName}/start`).query({ sync: true });
    });

    Then('bad gateway error is returned', () => {
      expect(response.statusCode, response.text).to.equal(502);
      expect(response.body.message).to.match(/expected error/i);
    });

    Given('a process that with a malformatted script task', () => {
      deploymentName = 'malformatted-script-process';
      return createDeployment(
        app,
        deploymentName,
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <scriptTask id="task" scriptFormat="javascript">
              <script>next(new Error();</script>
            </scriptTask>
          </process>
        </definitions>`
      );
    });

    When('process is started in sync', async () => {
      response = await request(app).post(`/rest/process-definition/${deploymentName}/start`).query({ sync: true });
    });

    Then('bad gateway error is returned', () => {
      expect(response.statusCode, response.text).to.equal(502);
      expect(response.body.message).to.match(/missing/);
    });
  });

  Scenario('sync and idle timeout query parameters', () => {
    let response;
    When('attempting to start sync with malformatted idle timeout ISO 8601 duration', async () => {
      response = await request(app).post(`/rest/process-definition/wait-process/start?sync=FOO&idletimeout=2020-02-01/PT10S`);
    });

    Then('bad request is returned', () => {
      expect(response.statusCode, response.text).to.equal(400);
      expect(response.text).to.match(/ISO 8601/i);
    });

    When('start with negative idle timeout query parameter', async () => {
      response = await request(app).post(`/rest/process-definition/wait-process/start?idletimeout=-10000`);
    });

    Then('bad request is returned', () => {
      expect(response.statusCode, response.text).to.equal(400);
      expect(response.text).to.match(/positive/i);
    });

    When('start with empty idle timeout query parameter', async () => {
      response = await request(app).post(`/rest/process-definition/wait-process/start?idletimeout=`);
    });

    Then('ok is returned', () => {
      expect(response.statusCode, response.text).to.equal(201);
    });
  });
});

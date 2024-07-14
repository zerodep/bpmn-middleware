import request from 'supertest';
import * as ck from 'chronokinesis';

import { createDeployment, waitForProcess, horizontallyScaled, getAppWithExtensions } from '../helpers/testHelpers.js';
import { MemoryAdapter } from '../../src/index.js';
import { DEFAULT_IDLE_TIMER } from '../../src/constants.js';

Feature('call activity', () => {
  after(ck.reset);

  Scenario('call process in the same diagram', () => {
    let apps, adapter;
    before('two parallel app instances with a shared adapter source', () => {
      adapter = new MemoryAdapter();
      apps = horizontallyScaled(2, { adapter });
    });
    after(() => apps.stop());

    Given('a process with a call activity referencing a process in the same diagram', () => {
      return createDeployment(
        apps.balance(),
        'call-internal-process',
        `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="main-process" isExecutable="true">
            <startEvent id="start" />
            <sequenceFlow id="to-call-activity" sourceRef="start" targetRef="call-activity" />
            <callActivity id="call-activity" calledElement="called-process" />
            <endEvent id="end" />
            <sequenceFlow id="to-end" sourceRef="call-activity" targetRef="end" />
          </process>
          <process id="called-process" isExecutable="false">
            <task id="task" />
          </process>
        </definitions>`
      );
    });

    let end;
    When('when process is started', async () => {
      const app = apps.balance();
      end = waitForProcess(app, 'call-internal-process').end();

      await request(app).post('/rest/process-definition/call-internal-process/start').expect(201);
    });

    Then('run completes', () => {
      return end;
    });

    Given('a process with a call activity referencing a process with user task', () => {
      return createDeployment(
        apps.balance(),
        'call-internal-user-process',
        `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="main-process" isExecutable="true">
            <startEvent id="start" />
            <sequenceFlow id="to-call-activity" sourceRef="start" targetRef="call-activity" />
            <callActivity id="call-activity" calledElement="called-process" />
            <endEvent id="end" />
            <sequenceFlow id="to-end" sourceRef="call-activity" targetRef="end" />
          </process>
          <process id="called-process" isExecutable="false">
            <userTask id="task" />
          </process>
        </definitions>`
      );
    });

    let token, wait;
    When('when process is started', async () => {
      const app = apps.balance();
      wait = waitForProcess(app, 'call-internal-user-process').wait('task');

      const response = await request(app).post('/rest/process-definition/call-internal-user-process/start').expect(201);

      token = response.body.id;
    });

    Then('internal process user task is waiting', () => {
      return wait;
    });

    When('user task is signalled', () => {
      const app = apps.balance();
      wait = waitForProcess(app, token).end();

      return request(app).post(`/rest/signal/${token}`).send({ id: 'task' }).expect(200);
    });

    Then('run completes', () => {
      return end;
    });

    When('when process is started again', async () => {
      const app = apps.balance();
      wait = waitForProcess(app, 'call-internal-user-process').wait('task');

      const response = await request(app).post('/rest/process-definition/call-internal-user-process/start').expect(201);

      token = response.body.id;
    });

    Then('internal process user task is waiting', () => {
      return wait;
    });

    When('user task is errored', () => {
      const app = apps.balance();
      wait = waitForProcess(app, token).end();

      return request(app).post(`/rest/fail/${token}`).send({ id: 'task', message: 'foo' }).expect(200);
    });

    Then('run completes', () => {
      return end;
    });

    When('when process is started again again', async () => {
      const app = apps.balance();
      wait = waitForProcess(app, 'call-internal-user-process').wait('task');

      const response = await request(app).post('/rest/process-definition/call-internal-user-process/start').expect(201);

      token = response.body.id;
    });

    Then('internal process user task is waiting', () => {
      return wait;
    });

    When('main process call activity is cancelled', () => {
      const app = apps.balance();
      wait = waitForProcess(app, token).end();

      return request(app).post(`/rest/cancel/${token}`).send({ id: 'call-activity' }).expect(200);
    });

    Then('run completes', () => {
      return end;
    });
  });

  Scenario('call deployed process', () => {
    let apps, adapter;
    before(() => {
      adapter = new MemoryAdapter();
      apps = horizontallyScaled(2, { adapter });
    });
    after(() => apps.stop());

    Given('a process with a call activity referencing another deployed process', async () => {
      await createDeployment(
        apps.balance(),
        'call-deployment',
        `<definitions id="Def_main" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="main-process" isExecutable="true">
            <startEvent id="start" />
            <sequenceFlow id="to-call-activity" sourceRef="start" targetRef="call-activity" />
            <callActivity id="call-activity" calledElement="deployment:called-deployment">
              <extensionElements>
                <camunda:inputOutput>
                  <camunda:outputParameter name="from">\${content.output.message}</camunda:outputParameter>
                </camunda:inputOutput>
              </extensionElements>
            </callActivity>
            <endEvent id="end" />
            <sequenceFlow id="to-end" sourceRef="call-activity" targetRef="end" />
          </process>
        </definitions>`
      );

      await createDeployment(
        apps.balance(),
        'called-deployment',
        `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="called-deployment" isExecutable="true">
            <task id="task" />
          </process>
        </definitions>`
      );
    });

    let end1, end2;
    When('when process is started', async () => {
      const app = apps.balance();
      end1 = waitForProcess(app, 'call-deployment').end();
      end2 = waitForProcess(app, 'called-deployment').end();

      await request(app).post('/rest/process-definition/call-deployment/start').expect(201);
    });

    Then('called deployment completes', () => {
      return end2;
    });

    And('calling process completes', () => {
      return end1;
    });

    Given('called process is updated to wait for user input', async () => {
      await createDeployment(
        apps.balance(),
        'called-deployment',
        `<definitions id="Def_called"
        xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <process id="called-deployment" isExecutable="true">
          <userTask id="task">
            <extensionElements>
              <camunda:inputOutput>
                <camunda:outputParameter name="user">\${content.output.message}</camunda:outputParameter>
              </camunda:inputOutput>
            </extensionElements>
          </userTask>
        </process>
      </definitions>`
      );
    });

    let wait, callingToken;
    When('when process is started', async () => {
      const app = apps.balance();
      wait = waitForProcess(app, 'called-deployment').wait();

      const response = await request(app).post('/rest/process-definition/call-deployment/start').expect(201);

      callingToken = response.body.id;
    });

    let calledToken;
    Then('called deployment is waiting for user input', async () => {
      const waitingMessage = await wait;
      calledToken = waitingMessage.properties.token;
    });

    And('called process has caller process info', async () => {
      const response = await apps.request().get(`/rest/status/${calledToken}`).expect(200);

      expect(response.body).to.have.property('caller');
      expect(response.body.caller).to.have.property('token', callingToken);
      expect(response.body.caller).to.have.property('deployment', 'call-deployment');
      expect(response.body.caller).to.have.property('id', 'call-activity');
      expect(response.body.caller)
        .to.have.property('executionId')
        .that.match(/^call-activity.+/);
      expect(response.body.caller).to.have.property('type', 'bpmn:CallActivity');
    });

    When('called process is signaled with user input', () => {
      const app = apps.balance();
      end1 = waitForProcess(app, 'call-deployment').end();
      end2 = waitForProcess(app, 'called-deployment').end();

      return request(app)
        .post(`/rest/signal/${calledToken}`)
        .send({
          id: 'task',
          message: { foo: 'bar' },
        })
        .expect(200);
    });

    Then('called process completes', () => {
      return end2;
    });

    And('calling process completes', () => {
      return end1;
    });

    And('called process has output', async () => {
      const response = await apps.request().get(`/rest/state/${calledToken}`).expect(200);

      expect(response.body.engine.environment.output).to.deep.equal({ user: { foo: 'bar' } });
    });

    And('calling process has output from called process', async () => {
      const response = await apps.request().get(`/rest/state/${callingToken}`).expect(200);

      expect(response.body.engine.environment.output).to.deep.equal({ from: { user: { foo: 'bar' } } });
    });

    Given('called deployed process will fail for some reason', async () => {
      await createDeployment(
        apps.balance(),
        'called-deployment',
        `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="called-deployment" isExecutable="true">
          <scriptTask id="task" scriptFormat="javascript">
            <script>
              next(new TypeError('foo'))
            </script>
          </scriptTask>
        </process>
      </definitions>`
      );
    });

    let err1, err2;
    When('when process is started again', async () => {
      const app = apps.balance();
      err1 = waitForProcess(app, 'call-deployment').error();
      err2 = waitForProcess(app, 'called-deployment').error();

      await request(app).post('/rest/process-definition/call-deployment/start').expect(201);
    });

    Then('called deployment fails', async () => {
      const error = await err2;
      expect(error.message).to.equal('foo');
    });

    And('calling process fails', async () => {
      const error = await err1;
      expect(error.message).to.match(/foo/i);
    });
  });

  Feature('call activity is cancelled', () => {
    let apps, adapter;
    before('two parallel app instances with a shared adapter source', () => {
      adapter = new MemoryAdapter();
      apps = horizontallyScaled(2, { adapter });
    });
    after(() => apps.stop());

    Given('a process that times out if no response from call activity', async () => {
      await createDeployment(
        apps.balance(),
        'call-deployment',
        `<definitions id="Parent" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="main-process" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-call-activity" sourceRef="start" targetRef="call-activity" />
          <callActivity id="call-activity" calledElement="deployment:called-deployment" />
          <boundaryEvent id="bound-timer" attachedToRef="call-activity" cancelActivity="true">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">PT30S</timeDuration>
            </timerEventDefinition>
          </boundaryEvent>
          <sequenceFlow id="to-end" sourceRef="call-activity" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`
      );

      await createDeployment(
        apps.balance(),
        'called-deployment',
        `<definitions id="Child" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="called-deployment" isExecutable="true">
          <userTask id="task" />
        </process>
      </definitions>`
      );
    });

    let wait, bp;
    When('when process is started', async () => {
      const app = apps.balance();
      wait = waitForProcess(app, 'called-deployment').wait();

      const response = await request(app).post('/rest/process-definition/call-deployment/start').expect(201);

      bp = response.body;

      return wait;
    });

    And('another process instance is started', () => {
      return apps.request().post('/rest/process-definition/call-deployment/start').expect(201);
    });

    let calledToken, expireAt;
    Then('both processes have started', async () => {
      const response = await apps.request().get('/rest/running').expect(200);

      expect(response.body.engines.length).to.be.above(1);

      const parent = response.body.engines.find((e) => e.token === bp.id);
      expect(parent).to.be.ok.and.have.property('state', 'running');
      expireAt = parent.expireAt;
      expect(expireAt).to.be.ok;

      const child = response.body.engines.find((e) => e.caller?.token === bp.id);
      expect(child).to.be.ok.and.have.property('state', 'running');
      calledToken = child.token;
    });

    When('calling process times out', () => {
      ck.travel(expireAt);

      const [engine] = apps.getRunningByToken(bp.id);
      const completed = engine.waitFor('end');
      const timer = engine.environment.timers.executing.find((t) => t.owner.id === 'bound-timer');
      timer.callback();
      return completed;
    });

    Then('only the second processes are running', async () => {
      const response = await apps.request().get('/rest/running').expect(200);

      expect(response.body.engines.length).to.equal(2);

      const parent = response.body.engines.find((e) => e.token === bp.id);
      expect(parent).to.not.be.ok;
    });

    And('calling process is idle', async () => {
      const response = await apps.request().get(`/rest/status/${bp.id}`).expect(200);

      expect(response.body.state).to.equal('idle');
    });

    And('called process is idle', async () => {
      const response = await apps.request().get(`/rest/status/${calledToken}`).expect(200);

      expect(response.body.state).to.equal('idle');
    });

    And('only the second process engines are running', () => {
      expect(apps.getRunning()).to.have.length(2);
    });
  });

  Feature('calling process has disappeared', () => {
    let apps, adapter;
    before('two parallel app instances with a shared adapter source', () => {
      adapter = new MemoryAdapter();
      apps = horizontallyScaled(2, { adapter });
    });
    after(() => apps.stop());

    Given('a process with call activity that starts deployment', async () => {
      await createDeployment(
        apps.balance(),
        'call-deployment',
        `<definitions id="Parent" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="main-process" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-call-activity" sourceRef="start" targetRef="call-activity" />
          <callActivity id="call-activity" calledElement="deployment:called-deployment" />
          <sequenceFlow id="to-end" sourceRef="call-activity" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`
      );

      await createDeployment(
        apps.balance(),
        'called-deployment',
        `<definitions id="Child" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="called-deployment" isExecutable="true">
          <userTask id="task" />
        </process>
      </definitions>`
      );
    });

    let wait, bp;
    When('when process is started', async () => {
      const app = apps.balance();
      wait = waitForProcess(app, 'called-deployment').wait();

      const response = await request(app).post('/rest/process-definition/call-deployment/start').expect(201);

      bp = response.body;

      return wait;
    });

    Then('both processes have started', async () => {
      const response = await apps.request().get('/rest/running').expect(200);

      expect(response.body.engines.length).to.equal(2);
    });

    When('both processes have idled and are stopped', () => {
      ck.travel(Date.now() + DEFAULT_IDLE_TIMER);
      apps.getRunning().map((e) => e.idleTimer.callback());
    });

    Given('calling process is deleted from database', () => {
      ck.travel(Date.now() + 1000 * 60 * 60 * 24);

      return apps.request().delete(`/rest/state/${bp.id}`).expect(204);
    });

    let calledToken, warn;
    When('called process is signaled', async () => {
      const response = await apps.request().get('/rest/running').expect(200);

      expect(response.body.engines).to.have.length(1);
      calledToken = response.body.engines[0].token;

      const app = apps.balance();
      warn = new Promise((resolve) => app.once('bpmn/warn', resolve));

      return request(app).post(`/rest/signal/${calledToken}`).send({ id: 'task' }).expect(200);
    });

    Then('called process is idle', async () => {
      const response = await apps.request().get(`/rest/status/${calledToken}`).expect(200);

      expect(response.body.state).to.equal('idle');
    });

    And('a warning was emitted', async () => {
      const warning = await warn;
      expect(warning.statusCode, warning.message).to.equal(404);
      expect(warning.message).to.contain(bp.id);
    });

    And('no engines are running', () => {
      expect(apps.getRunning()).to.have.length(0);
    });

    When('when process is started again', async () => {
      const app = apps.balance();
      wait = waitForProcess(app, 'called-deployment').wait();

      const response = await request(app).post('/rest/process-definition/call-deployment/start').expect(201);

      bp = response.body;

      return wait;
    });

    Then('both processes have started', async () => {
      const response = await apps.request().get('/rest/running').expect(200);

      expect(response.body.engines.length).to.equal(2);
    });

    When('both processes have idled and are stopped', () => {
      ck.travel(Date.now() + DEFAULT_IDLE_TIMER);
      apps.getRunning().map((e) => e.idleTimer.callback());
    });

    Given('calling process is deleted from database', () => {
      ck.travel(Date.now() + 1000 * 60 * 60 * 24);

      return apps.request().delete(`/rest/state/${bp.id}`).expect(204);
    });

    When('called process task is considered failed', async () => {
      const response = await apps.request().get('/rest/running').expect(200);

      expect(response.body.engines).to.have.length(1);
      calledToken = response.body.engines[0].token;

      const app = apps.balance();
      warn = new Promise((resolve) => app.once('bpmn/warn', resolve));

      return request(app).post(`/rest/fail/${calledToken}`).send({ id: 'task' }).expect(200);
    });

    Then('called process is errored', async () => {
      const response = await apps.request().get(`/rest/status/${calledToken}`).expect(200);

      expect(response.body.state).to.equal('error');
    });

    And('a warning was emitted', async () => {
      const warning = await warn;
      expect(warning.statusCode, warning.message).to.equal(404);
      expect(warning.message).to.contain(bp.id);
    });

    And('no engines are running', () => {
      expect(apps.getRunning()).to.have.length(0);
    });
  });

  Feature('called process has disappeared', () => {
    let apps, adapter;
    before('two parallel app instances with a shared adapter source', () => {
      adapter = new MemoryAdapter();
      apps = horizontallyScaled(2, { adapter });
    });
    after(() => apps.stop());

    Given('a process with call activity that starts deployment and a timer', async () => {
      await createDeployment(
        apps.balance(),
        'call-deployment',
        `<definitions id="Parent" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="main-process" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-call-activity" sourceRef="start" targetRef="call-activity" />
          <callActivity id="call-activity" calledElement="deployment:called-deployment" />
          <boundaryEvent id="bound-timer" attachedToRef="call-activity">
            <timerEventDefinition>
              <timeDuration xsi:type="tFormalExpression">P1D</timeDuration>
            </timerEventDefinition>
          </boundaryEvent>
          <sequenceFlow id="to-end" sourceRef="call-activity" targetRef="end" />
          <endEvent id="end" />
        </process>
      </definitions>`
      );

      await createDeployment(
        apps.balance(),
        'called-deployment',
        `<definitions id="Child" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="called-deployment" isExecutable="true">
          <userTask id="task" />
        </process>
      </definitions>`
      );
    });

    let wait, bp;
    When('when process is started', async () => {
      const app = apps.balance();
      wait = waitForProcess(app, 'called-deployment').wait();

      const response = await request(app).post('/rest/process-definition/call-deployment/start').expect(201);

      bp = response.body;

      return wait;
    });

    let calledToken;
    Then('both processes have started', async () => {
      const response = await apps.request().get('/rest/running').expect(200);

      expect(response.body.engines.length).to.equal(2);
      calledToken = response.body.engines.find((e) => e.name === 'called-deployment').token;
    });

    When('both processes have idled and are stopped', () => {
      ck.travel(Date.now() + DEFAULT_IDLE_TIMER);
      apps.getRunning().map((e) => e.idleTimer.callback());
    });

    let end;
    Given('called process is deleted from database', () => {
      return apps.request().delete(`/rest/state/${calledToken}`).expect(204);
    });

    When('calling process is resumed', () => {
      ck.travel(Date.now() + 1000 * 60 * 60 * 24);

      const app = apps.balance();
      end = waitForProcess(app, bp.id).end();

      return request(app).post(`/rest/resume/${bp.id}`).expect(200);
    });

    Then('calling process completes', () => {
      return end;
    });

    And('calling process is idle', async () => {
      const response = await apps.request().get(`/rest/status/${bp.id}`).expect(200);

      expect(response.body.state).to.equal('idle');
    });
  });

  Feature('single app instance', () => {
    let app;
    before(() => {
      app = getAppWithExtensions();
    });
    after(() => {
      return request(app).delete('/rest/internal/stop').expect(204);
    });

    Given('a process with a call activity referencing another deployed process', async () => {
      await createDeployment(
        app,
        'call-deployment',
        `<definitions id="Def_main" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="main-process" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-call-activity" sourceRef="start" targetRef="call-activity" />
          <callActivity id="call-activity" calledElement="deployment:called-deployment">
            <extensionElements>
              <camunda:inputOutput>
                <camunda:outputParameter name="from">\${content.output.message}</camunda:outputParameter>
              </camunda:inputOutput>
            </extensionElements>
          </callActivity>
          <endEvent id="end" />
          <sequenceFlow id="to-end" sourceRef="call-activity" targetRef="end" />
        </process>
      </definitions>`
      );

      await createDeployment(
        app,
        'called-deployment',
        `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="called-deployment" isExecutable="true">
          <task id="task" />
        </process>
      </definitions>`
      );
    });

    let end1, end2;
    When('when process is started', async () => {
      end1 = waitForProcess(app, 'call-deployment').end();
      end2 = waitForProcess(app, 'called-deployment').end();

      await request(app).post('/rest/process-definition/call-deployment/start').expect(201);
    });

    Then('called deployment completes', () => {
      return end2;
    });

    And('calling process completes', () => {
      return end1;
    });

    Given('called process is updated to wait for user input', async () => {
      await createDeployment(
        app,
        'called-deployment',
        `<definitions id="Def_called"
        xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <process id="called-deployment" isExecutable="true">
          <userTask id="task">
            <extensionElements>
              <camunda:inputOutput>
                <camunda:outputParameter name="user">\${content.output.message}</camunda:outputParameter>
              </camunda:inputOutput>
            </extensionElements>
          </userTask>
        </process>
      </definitions>`
      );
    });

    let wait, callingToken;
    When('when process is started', async () => {
      wait = waitForProcess(app, 'called-deployment').wait();

      const response = await request(app).post('/rest/process-definition/call-deployment/start').expect(201);

      callingToken = response.body.id;
    });

    let calledToken;
    Then('called deployment is waiting for user input', async () => {
      const waitingMessage = await wait;
      calledToken = waitingMessage.properties.token;
    });

    And('called process has caller process info', async () => {
      const response = await request(app).get(`/rest/status/${calledToken}`).expect(200);

      expect(response.body).to.have.property('caller');
      expect(response.body.caller).to.have.property('token', callingToken);
      expect(response.body.caller).to.have.property('deployment', 'call-deployment');
      expect(response.body.caller).to.have.property('id', 'call-activity');
      expect(response.body.caller)
        .to.have.property('executionId')
        .that.match(/^call-activity.+/);
      expect(response.body.caller).to.have.property('type', 'bpmn:CallActivity');
    });

    When('called process is signaled with user input', () => {
      end1 = waitForProcess(app, 'call-deployment').end();
      end2 = waitForProcess(app, 'called-deployment').end();

      return request(app)
        .post(`/rest/signal/${calledToken}`)
        .send({
          id: 'task',
          message: { foo: 'bar' },
        })
        .expect(200);
    });

    Then('called process completes', () => {
      return end2;
    });

    And('calling process completes', () => {
      return end1;
    });

    And('called process has output', async () => {
      const response = await request(app).get(`/rest/state/${calledToken}`).expect(200);

      expect(response.body.engine.environment.output).to.deep.equal({ user: { foo: 'bar' } });
    });

    And('calling process has output from called process', async () => {
      const response = await request(app).get(`/rest/state/${callingToken}`).expect(200);

      expect(response.body.engine.environment.output).to.deep.equal({ from: { user: { foo: 'bar' } } });
    });
  });
});

import { createDeployment, horizontallyScaled } from '../helpers/test-helpers.js';
import { MemoryAdapter } from '../../src/index.js';

Feature('cancel activity', () => {
  let apps, adapter;
  before('two parallel app instances with a shared adapter source', () => {
    adapter = new MemoryAdapter();
    apps = horizontallyScaled(2, { adapter });
  });
  after(() => apps.stop());

  Scenario('cancel running process activity', () => {
    Given('a process with a parallel multi-instance user task', async () => {
      await createDeployment(
        apps.balance(),
        'task-to-cancel',
        `<definitions id="Child" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="user-task" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
        <userTask id="task">
          <multiInstanceLoopCharacteristics isSequential="false">
            <loopCardinality>4</loopCardinality>
          </multiInstanceLoopCharacteristics>
        </userTask>
      </process>
    </definitions>`
      );
    });

    And('another process with a long running timer', async () => {
      await createDeployment(
        apps.balance(),
        'timer-to-cancel',
        `<definitions id="Child" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="user-task" isExecutable="true">
        <startEvent id="start" name="Long running">
          <timerEventDefinition>
            <timeDuration xsi:type="tFormalExpression">P1Y</timeDuration>
          </timerEventDefinition>
        </startEvent>
      </process>
    </definitions>`
      );
    });

    When('processes are started', async () => {
      await apps.request().post('/rest/process-definition/task-to-cancel/start').expect(201);

      await apps.request().post('/rest/process-definition/task-to-cancel/start').expect(201);

      await apps.request().post('/rest/process-definition/timer-to-cancel/start').expect(201);

      await apps.request().post('/rest/process-definition/timer-to-cancel/start').expect(201);
    });

    let response, running;
    Then('all are running', async () => {
      response = await apps.request().get('/rest/running').expect(200);

      expect(response.body.engines).to.have.length(4);
      running = response.body.engines;
    });

    When('attempting to cancel user task process start event', async () => {
      const bp = running.find((p) => p.name === 'task-to-cancel');
      response = await apps.request().post(`/rest/cancel/${bp.token}`).send({ id: 'start' });
    });

    Then('bad request is returned since it is not running', () => {
      expect(response.statusCode, response.text).to.equal(400);
    });

    When('attempting to cancel user task process but with wrong id', async () => {
      const bp = running.find((p) => p.name === 'task-to-cancel');
      response = await apps.request().post(`/rest/cancel/${bp.token}`).send({ id: 'foo' });
    });

    Then('bad request is returned', () => {
      expect(response.statusCode, response.text).to.equal(400);
    });

    let bp;
    When('timer process postponed activity is fetched', async () => {
      bp = running.find((p) => p.name === 'timer-to-cancel');

      response = await apps.request().get(`/rest/status/${bp.token}/${bp.postponed[0].id}`);
    });

    let activity;
    Then('timer execution activity is presented', () => {
      expect(response.statusCode, response.text).to.equal(200);
      activity = response.body;

      expect(activity).to.have.property('token', bp.token);
      expect(activity).to.have.property('id', 'start');
      expect(activity).to.have.property('type', 'bpmn:StartEvent');
      expect(activity).to.have.property('name', 'Long running');
      expect(activity).to.have.property('executing').with.length(1);
    });

    When('attempting to cancel timer process with correct id', async () => {
      response = await apps.request().post(`/rest/cancel/${bp.token}`).send(activity.executing[0]);
    });

    Then('ok is returned', () => {
      expect(response.statusCode, response.text).to.equal(200);
    });

    And('only three processes are running', async () => {
      expect(response.statusCode, response.text).to.equal(200);

      response = await apps.request().get('/rest/running').expect(200);

      expect(response.body.engines).to.have.length(3);
    });
  });
});

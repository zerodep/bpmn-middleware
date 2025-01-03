import request from 'supertest';
import { STORAGE_TYPE_STATE } from '../../src/index.js';

import {
  createDeployment,
  createDeploymentForm,
  getExampleApp,
  getResource,
  waitForProcess,
  getExampleResource,
} from '../helpers/test-helpers.js';

const externalScriptSource = getResource('script-resource.bpmn');
const roleSource = getResource('requires-role.bpmn');

Feature('example app', () => {
  let app;
  before('example app is started', async () => {
    app = await getExampleApp();
  });
  after(() => request(app).delete('/rest/internal/stop').expect(204));

  Scenario('flow with external script', () => {
    let deploymentName;
    Given('a process with external script is deployed', () => {
      deploymentName = 'external-scripts-process';
      return createDeployment(app, deploymentName, externalScriptSource, ['./test/resources/diagramscript.cjs']);
    });

    let wait, end, token;
    When('process is started', async () => {
      wait = waitForProcess(app, deploymentName).wait();
      end = waitForProcess(app, deploymentName).end();

      const { body } = await request(app).post(`/rest/process-definition/${deploymentName}/start`).expect(201);
      token = body.id;
    });

    And('manual task is signalled', async () => {
      const waitingTask = await wait;
      return request(app).post(`/rest/signal/${token}`).send({ id: waitingTask.content.id }).expect(200);
    });

    Then('run completes', () => {
      return end;
    });

    Given('a process with malformatted external script', () => {
      deploymentName = 'mal-external-scripts-process';
      return createDeployment(
        app,
        deploymentName,
        `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
          id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
          <process id="Process_1" isExecutable="true">
            <startEvent id="StartEvent_1">
              <outgoing>Flow_1u6ja4w</outgoing>
            </startEvent>
            <sequenceFlow id="Flow_1u6ja4w" sourceRef="StartEvent_1" targetRef="task" />
            <scriptTask id="task" scriptFormat="js" camunda:resultVariable="res" camunda:resource="./save-state.bpmn">
              <incoming>Flow_1u6ja4w</incoming>
              <outgoing>Flow_1mu3zt8</outgoing>
            </scriptTask>
            <endEvent id="Event_15e8i4b">
              <incoming>Flow_1mu3zt8</incoming>
            </endEvent>
            <sequenceFlow id="Flow_1mu3zt8" sourceRef="task" targetRef="Event_15e8i4b" />
          </process>
          <signal id="Signal_0" name="One and only signal" />
        </definitions>`,
        ['./example/processes/save-state.bpmn']
      );
    });

    let fail;
    When('process is started', async () => {
      fail = waitForProcess(app, deploymentName).error();

      await request(app).post(`/rest/process-definition/${deploymentName}/start`).expect(201);
    });

    Then('run fails with syntax error', async () => {
      const err = await fail;
      expect(err.toString()).to.contain('SyntaxError');
    });

    Given('a process with an external resource with invalid mime type', async () => {
      deploymentName = 'svg-external-scripts-process';
      const form = await createDeploymentForm(
        deploymentName,
        `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
          id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
          <process id="Process_1" isExecutable="true">
            <scriptTask id="task" scriptFormat="js" camunda:resultVariable="res" camunda:resource="./save-state.svg" />
          </process>
        </definitions>`
      );

      form.append('./public/images/save-state.svg', '<svg/>', { filename: './save-state.svg', contentType: 'image/svg+xml' });

      await request(app).post('/rest/deployment/create').set(form.getHeaders()).send(form.getBuffer().toString());
    });

    When('process is started', async () => {
      fail = waitForProcess(app, deploymentName).error();

      await request(app).post(`/rest/process-definition/${deploymentName}/start`).expect(201);
    });

    Then('run fails with resource error', async () => {
      const err = await fail;
      expect(err.toString()).to.contain('FlowResourceError');
    });

    Given('a process with non-existing external resource', () => {
      deploymentName = '404-external-scripts-process';
      return createDeployment(
        app,
        deploymentName,
        `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
          id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
          <process id="Process_1" isExecutable="true">
            <scriptTask id="task" scriptFormat="js" camunda:resultVariable="res" camunda:resource="./save-state.js" />
          </process>
        </definitions>`
      );
    });

    When('process is started', async () => {
      fail = waitForProcess(app, deploymentName).error();

      await request(app).post(`/rest/process-definition/${deploymentName}/start`).expect(201);
    });

    Then('run fails with resource error', async () => {
      const err = await fail;
      expect(err.toString()).to.contain('FlowResourceError');
    });
  });

  Scenario('flow that require user role to run', () => {
    let deploymentName;
    Given('a process with user roles', () => {
      deploymentName = 'role-process';
      return createDeployment(app, deploymentName, roleSource);
    });

    And('some users', async () => {
      await app.locals.addUser(app.locals.middleware.middleware.adapter, {
        username: 'jan',
        name: 'Jan Bananberg',
        password: 'someuniqueprofanesentence',
        role: ['user'],
      });
      await app.locals.addUser(app.locals.middleware.middleware.adapter, {
        username: 'jane',
        name: 'Jane Bananberg',
        password: 'someuniqueprofanesentence',
        role: ['admin'],
      });
      await app.locals.addUser(app.locals.middleware.middleware.adapter, {
        username: 'ben',
        name: 'Ben Bananberg',
        password: 'someuniqueprofanesentence',
      });
      await app.locals.middleware.middleware.adapter.upsert('user', 'bad', '<xml/>');
    });

    let response;
    When('process is started with authorized user', async () => {
      response = await request(app)
        .post(`/rest/auth/process-definition/${deploymentName}/start`)
        .set('authorization', 'Basic ' + Buffer.from('jane:someuniqueprofanesentence').toString('base64url'));
    });

    let token;
    Then('process is started', () => {
      expect(response.statusCode, response.text).to.equal(201);
      token = response.body.id;
    });

    When('process status is fetched', async () => {
      response = await request(app)
        .get(`/rest/auth/state/${token}`)
        .set('authorization', 'Basic ' + Buffer.from('jane:someuniqueprofanesentence').toString('base64url'));
    });

    Then('status is returned', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('state', 'idle');
    });

    describe('unauthenticated', () => {
      When('process is started without authentication', async () => {
        response = await request(app).post(`/rest/auth/process-definition/${deploymentName}/start`);
      });

      Then('unauthenticated is returned', () => {
        expect(response.statusCode, response.text).to.equal(401);
      });

      When('attempting to get process state without authorization', async () => {
        response = await request(app).get('/rest/auth/state/my-fake-token');
      });

      Then('unauthenticated is returned', () => {
        expect(response.statusCode, response.text).to.equal(401);
      });

      When('process is started with unknown user', async () => {
        response = await request(app)
          .post(`/rest/auth/process-definition/${deploymentName}/start`)
          .set('authorization', 'Basic ' + Buffer.from('foo:bar').toString('base64url'));
      });

      Then('unauthenticated is returned', () => {
        expect(response.statusCode, response.text).to.equal(401);
      });

      When('process is started with known user but without password', async () => {
        response = await request(app)
          .post(`/rest/auth/process-definition/${deploymentName}/start`)
          .set('authorization', 'Basic ' + Buffer.from('jan').toString('base64url'));
      });

      Then('unauthenticated is returned', () => {
        expect(response.statusCode, response.text).to.equal(401);
      });

      When('process is started with too short password', async () => {
        response = await request(app)
          .post(`/rest/auth/process-definition/${deploymentName}/start`)
          .set('authorization', 'Basic ' + Buffer.from('jan:someuniqueprofanesentenc').toString('base64url'));
      });

      Then('unauthenticated is returned', () => {
        expect(response.statusCode, response.text).to.equal(401);
      });

      When('process is started with too long password', async () => {
        response = await request(app)
          .post(`/rest/auth/process-definition/${deploymentName}/start`)
          .set(
            'authorization',
            'Basic ' + Buffer.from(`jan:someuniqueprofanesentence${new Array(1000).fill('a').join('')}`).toString('base64url')
          );
      });

      Then('unauthenticated is returned', () => {
        expect(response.statusCode, response.text).to.equal(401);
      });

      When('process is started with bad user data', async () => {
        response = await request(app)
          .post(`/rest/auth/process-definition/${deploymentName}/start`)
          .set('authorization', 'Basic ' + Buffer.from('bad:pass').toString('base64url'));
      });

      Then('bad gateway is returned', () => {
        expect(response.statusCode, response.text).to.equal(502);
      });
    });

    describe('unauthorized', () => {
      When('process is started with user that lacks proper roles', async () => {
        response = await request(app)
          .post(`/rest/auth/process-definition/${deploymentName}/start`)
          .set('authorization', 'Basic ' + Buffer.from('jan:someuniqueprofanesentence').toString('base64url'));
      });

      Then('forbidden is returned', () => {
        expect(response.statusCode, response.text).to.equal(403);
      });

      When('process is started with user that has no roles', async () => {
        response = await request(app)
          .post(`/rest/auth/process-definition/${deploymentName}/start`)
          .set('authorization', 'Basic ' + Buffer.from('ben:someuniqueprofanesentence').toString('base64url'));
      });

      Then('forbidden is returned', () => {
        expect(response.statusCode, response.text).to.equal(403);
      });
    });

    describe('bad source', () => {
      Given('a process with bad source is deployed', () => {
        return createDeployment(app, 'bad-soruce', '<bpmn/>');
      });

      When('a process with bad source is deployed', async () => {
        response = await request(app)
          .post(`/rest/auth/process-definition/bad-soruce/start`)
          .set('authorization', 'Basic ' + Buffer.from('jan:someuniqueprofanesentence').toString('base64url'));
      });

      Then('502 is returned', () => {
        expect(response.statusCode, response.text).to.equal(502);
      });
    });
  });

  Scenario('custom start route that runs to end and returns engine output', () => {
    let deploymentName;
    Given('a process with a task awaiting signal', () => {
      deploymentName = 'sync-process';
      return createDeployment(app, deploymentName, getExampleResource('task.bpmn'));
    });

    let response;
    When('process is started', async () => {
      response = await request(app).post(`/start/sync/${deploymentName}`);
    });

    Then('run completed and returned process output', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('output').that.deep.equal({ foo: 'bar' });
    });

    When('process is started again with option to delete', async () => {
      response = await request(app).post(`/start/sync/${deploymentName}`).query({ delete: true });
    });

    Then('run completed and returned process output', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('output').that.deep.equal({ foo: 'bar' });
    });

    And('state is deleted', async () => {
      const adapter = app.locals.middleware.middleware.adapter;
      expect(await adapter.fetch(STORAGE_TYPE_STATE, response.body.token)).to.not.be.ok;
    });
  });

  Scenario('custom signal route that runs to end and returns engine output', () => {
    let deploymentName;
    Given('a process with a task awaiting signal', () => {
      deploymentName = 'waiter';
      return createDeployment(app, deploymentName, getResource('wait.bpmn'));
    });

    let wait, token;
    And('process is started', async () => {
      wait = waitForProcess(app, deploymentName).wait();

      const { body } = await request(app).post(`/rest/process-definition/${deploymentName}/start`).expect(201);
      token = body.id;
    });

    let waitingTask, response;
    When('manual task is signalled via custom route', async () => {
      waitingTask = await wait;
      response = await request(app).post(`/signal/${token}`).send({ id: waitingTask.content.id, foo: 'bar' });
    });

    Then('run output is returned', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body)
        .to.have.property('output')
        .that.deep.equal({ signal: { id: waitingTask.content.id, foo: 'bar' } });
    });

    When('same manual task is signalled again via custom route', async () => {
      waitingTask = await wait;
      response = await request(app).post(`/signal/${token}`).send({ id: waitingTask.content.id, foo: 'bar' });
    });

    Then('bad request is returned', () => {
      expect(response.statusCode, response.text).to.equal(400);
    });

    Given('process is started again', async () => {
      wait = waitForProcess(app, deploymentName).wait();

      const { body } = await request(app).post(`/rest/process-definition/${deploymentName}/start`).expect(201);
      token = body.id;
    });

    When('manual task is signalled via custom route with query param to delete state when complete', async () => {
      waitingTask = await wait;
      response = await request(app).post(`/signal/${token}`).query({ delete: true }).send({ id: waitingTask.content.id, foo: 'bar' });
    });

    Then('run completes', () => {
      expect(response.statusCode, response.text).to.equal(200);
    });

    And('run output is returned', () => {
      expect(response.body)
        .to.have.property('output')
        .that.deep.equal({ signal: { id: waitingTask.content.id, foo: 'bar' } });
    });

    And('state is deleted', async () => {
      const adapter = app.locals.middleware.middleware.adapter;
      expect(await adapter.fetch(STORAGE_TYPE_STATE, token)).to.not.be.ok;
    });
  });
});

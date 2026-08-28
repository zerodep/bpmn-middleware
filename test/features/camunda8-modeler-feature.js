import request from 'supertest';
import FormData from 'form-data';

import { getExampleApp, getExampleResource, waitForProcess } from '../helpers/test-helpers.js';

const modelerSource = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
  id="Definitions_modeler_greeting" targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="modeler-greeting-process" isExecutable="true">
    <startEvent id="start">
      <outgoing>to-task</outgoing>
    </startEvent>
    <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
    <task id="task">
      <extensionElements>
        <zeebe:ioMapping>
          <zeebe:output source="=greeting" target="greetingOut" />
        </zeebe:ioMapping>
      </extensionElements>
      <incoming>to-task</incoming>
      <outgoing>to-end</outgoing>
    </task>
    <sequenceFlow id="to-end" sourceRef="task" targetRef="end" />
    <endEvent id="end">
      <incoming>to-end</incoming>
    </endEvent>
  </process>
</definitions>`;

Feature('camunda 8 modeler', () => {
  /** @type {import('express').Express} */
  let app;
  before('example app is started', async () => {
    app = await getExampleApp();
  });
  after(() => request(app).delete('/rest/internal/stop').expect(204));

  Scenario('modeler validates cluster connection', () => {
    let response;
    When('modeler probes the cluster endpoint', async () => {
      response = await request(app).get('/rest/v2/topology');
    });

    Then('topology with gateway version is returned', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('gatewayVersion');
    });
  });

  Scenario('modeler deploys and starts a Camunda 8 diagram', () => {
    let deployResponse;
    When('modeler deploys diagram', async () => {
      const form = new FormData();
      form.append('resources', modelerSource, { filename: 'modeler-greeting.bpmn', contentType: 'application/octet-stream' });
      deployResponse = await request(app).post('/rest/v2/deployments').set(form.getHeaders()).send(form.getBuffer().toString());
    });

    Then('deployment response maps resource name to executable process id', () => {
      expect(deployResponse.statusCode, deployResponse.text).to.equal(200);
      expect(deployResponse.body).to.have.property('deploymentKey');

      const [deployed] = deployResponse.body.deployments;
      expect(deployed.processDefinition.processDefinitionId).to.equal('modeler-greeting-process');
      expect(deployed.processDefinition.resourceName).to.equal('modeler-greeting.bpmn');
      expect(deployed.processDefinition).to.have.property('processDefinitionVersion');
    });

    let end, startResponse;
    When('modeler starts instance with variables', async () => {
      end = waitForProcess(app, 'modeler-greeting').end();
      startResponse = await request(app)
        .post('/rest/v2/process-instances')
        .send({ processDefinitionId: 'modeler-greeting-process', variables: { greeting: 'howdy' } });
    });

    Then('process instance key is returned', () => {
      expect(startResponse.statusCode, startResponse.text).to.equal(200);
      expect(startResponse.body).to.have.property('processInstanceKey');
      expect(startResponse.body.processDefinitionId).to.equal('modeler-greeting-process');
    });

    And('run completes', () => {
      return end;
    });

    And('engine status is available under the process instance key', async () => {
      const { body } = await request(app).get(`/rest/status/${startResponse.body.processInstanceKey}`).expect(200);
      expect(body).to.have.property('token', startResponse.body.processInstanceKey);
    });

    let operateResponse;
    When('modeler "Open in Operate" link is followed with Operate URL pointing to the middleware', async () => {
      operateResponse = await request(app).get(`/rest/processes/${startResponse.body.processInstanceKey}`);
    });

    Then('request is redirected to engine status', () => {
      expect(operateResponse.statusCode, operateResponse.text).to.equal(302);
      expect(operateResponse.headers).to.have.property('location', `/rest/status/${startResponse.body.processInstanceKey}`);
    });
  });

  Scenario('modeler deploys and starts the example Camunda 8 dinner diagram calling a deployed decision', () => {
    Given('modeler deploys dinner decisions dmn', async () => {
      const form = new FormData();
      form.append('resources', getExampleResource('dinner.dmn'), {
        filename: 'dinner-decisions.dmn',
        contentType: 'application/octet-stream',
      });

      const response = await request(app).post('/rest/v2/deployments').set(form.getHeaders()).send(form.getBuffer().toString());

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('deploymentKey', 'dinner-decisions');
    });

    And('modeler deploys the Camunda 8 dinner diagram', async () => {
      const form = new FormData();
      form.append('resources', getExampleResource('camunda8-dinner.bpmn'), {
        filename: 'camunda8-dinner.bpmn',
        contentType: 'application/octet-stream',
      });

      const response = await request(app).post('/rest/v2/deployments').set(form.getHeaders()).send(form.getBuffer().toString());

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body.deployments[0].processDefinition).to.have.property('processDefinitionId', 'camunda8-dinner-process');
    });

    let end, startResponse;
    When('modeler starts a dinner instance', async () => {
      end = waitForProcess(app, 'camunda8-dinner').end();

      startResponse = await request(app)
        .post('/rest/v2/process-instances')
        .send({ processDefinitionId: 'camunda8-dinner-process', variables: { Season: 'Winter' } });

      expect(startResponse.statusCode, startResponse.text).to.equal(200);
    });

    Then('dinner is decided', async () => {
      await end;

      const { body } = await request(app).get(`/rest/state/${startResponse.body.processInstanceKey}`).expect(200);
      expect(body.engine.environment.output).to.have.property('dish', 'Roast beef');
    });
  });

  Scenario('modeler deploys a diagram with a cron timer start event', () => {
    const cronSource = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_modeler_cron" targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="modeler-cron-process" isExecutable="true">
    <startEvent id="start">
      <timerEventDefinition>
        <timeCycle>0 0 * * *</timeCycle>
      </timerEventDefinition>
      <outgoing>to-end</outgoing>
    </startEvent>
    <sequenceFlow id="to-end" sourceRef="start" targetRef="end" />
    <endEvent id="end">
      <incoming>to-end</incoming>
    </endEvent>
  </process>
</definitions>`;

    Given('modeler deploys the diagram', async () => {
      const form = new FormData();
      form.append('resources', cronSource, { filename: 'modeler-cron.bpmn', contentType: 'application/octet-stream' });
      await request(app).post('/rest/v2/deployments').set(form.getHeaders()).send(form.getBuffer().toString()).expect(200);
    });

    let response;
    When('deployment timers are fetched', async () => {
      response = await request(app).get('/rest/timers/modeler-cron').expect(200);
    });

    Then('the cron timer start event is parsed with next run as expire at', () => {
      expect(response.body.timers).to.have.length(1);
      const [timer] = response.body.timers;
      expect(timer, timer.message).to.have.property('success', true);
      expect(new Date(timer.expireAt).getTime()).to.be.above(Date.now());
      expect(timer).to.have.property('delay').that.is.a('number').above(0);
    });
  });

  Scenario('modeler requests that cannot be fulfilled', () => {
    let response;
    When('modeler starts an instance of an unknown process id', async () => {
      response = await request(app).post('/rest/v2/process-instances').send({ processDefinitionId: 'unknown-process' });
    });

    Then('not found is returned', () => {
      expect(response.statusCode, response.text).to.equal(404);
    });

    When('an instance is started without process definition id', async () => {
      response = await request(app).post('/rest/v2/process-instances').send({ variables: {} });
    });

    Then('bad request is returned', () => {
      expect(response.statusCode, response.text).to.equal(400);
    });

    When('modeler deploys without resources', async () => {
      const form = new FormData();
      form.append('tenantId', '<default>');
      response = await request(app).post('/rest/v2/deployments').set(form.getHeaders()).send(form.getBuffer().toString());
    });

    Then('bad request is returned', () => {
      expect(response.statusCode, response.text).to.equal(400);
    });

    When('modeler deploys a malformed diagram', async () => {
      const form = new FormData();
      form.append('resources', '<definitions', { filename: 'broken.bpmn', contentType: 'application/octet-stream' });
      response = await request(app).post('/rest/v2/deployments').set(form.getHeaders()).send(form.getBuffer().toString());
    });

    Then('bad request is returned', () => {
      expect(response.statusCode, response.text).to.equal(400);
    });
  });
});

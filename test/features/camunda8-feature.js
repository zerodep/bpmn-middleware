import request from 'supertest';
import FormData from 'form-data';

import { STORAGE_TYPE_PROCESS_DEFINITION } from 'bpmn-middleware';

import { createDeployment, horizontallyScaled, waitForProcess } from '../helpers/test-helpers.js';

const modelerSource = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_modeler_shopping" targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="modeler-shopping-process" isExecutable="true">
    <startEvent id="start">
      <outgoing>to-task</outgoing>
    </startEvent>
    <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
    <userTask id="task">
      <incoming>to-task</incoming>
      <outgoing>to-end</outgoing>
    </userTask>
    <sequenceFlow id="to-end" sourceRef="task" targetRef="end" />
    <endEvent id="end">
      <incoming>to-end</incoming>
    </endEvent>
  </process>
</definitions>`;

Feature('camunda 8 modeler routes', () => {
  let apps;
  before('two parallel app instances with shared storage', () => {
    apps = horizontallyScaled(2);
  });
  after(() => apps.stop());

  Scenario('modeler validates cluster connection', () => {
    let response;
    When('modeler probes the cluster endpoint', async () => {
      response = await apps.request().get('/rest/v2/topology');
    });

    Then('topology with gateway version is returned', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('gatewayVersion');
    });
  });

  Scenario('modeler deploys on one app instance and starts on another', () => {
    let deployResponse;
    When('modeler deploys diagram on first instance', async () => {
      const form = new FormData();
      form.append('resources', modelerSource, { filename: 'modeler-shopping.bpmn', contentType: 'application/octet-stream' });
      deployResponse = await request(apps.apps[0]).post('/rest/v2/deployments').set(form.getHeaders()).send(form.getBuffer().toString());
    });

    Then('deployment response maps resource name to executable process id', () => {
      expect(deployResponse.statusCode, deployResponse.text).to.equal(200);
      expect(deployResponse.body).to.have.property('deploymentKey', 'modeler-shopping');
      expect(deployResponse.body).to.have.property('tenantId');

      const [deployed] = deployResponse.body.deployments;
      expect(deployed.processDefinition.processDefinitionId).to.equal('modeler-shopping-process');
      expect(deployed.processDefinition.processDefinitionKey).to.equal('modeler-shopping');
      expect(deployed.processDefinition.resourceName).to.equal('modeler-shopping.bpmn');
      expect(deployed.processDefinition).to.have.property('processDefinitionVersion');
    });

    let wait, startResponse;
    When('modeler starts instance by process definition id on second instance', async () => {
      wait = waitForProcess(apps.apps[1], 'modeler-shopping').wait();

      startResponse = await request(apps.apps[1])
        .post('/rest/v2/process-instances')
        .send({ processDefinitionId: 'modeler-shopping-process', variables: { foo: 'bar' } });
    });

    Then('process instance key is returned', () => {
      expect(startResponse.statusCode, startResponse.text).to.equal(200);
      expect(startResponse.body).to.have.property('processInstanceKey');
      expect(startResponse.body).to.have.property('processDefinitionId', 'modeler-shopping-process');
    });

    let end;
    When('user task is signalled on first instance', async () => {
      const waitingTask = await wait;
      const token = startResponse.body.processInstanceKey;

      end = waitForProcess(apps.apps[0], token).end();

      return request(apps.apps[0]).post(`/rest/signal/${token}`).send({ id: waitingTask.content.id }).expect(200);
    });

    Then('run completes', () => {
      return end;
    });

    When('modeler starts instance by process definition key', async () => {
      startResponse = await request(apps.apps[0]).post('/rest/v2/process-instances').send({ processDefinitionKey: 'modeler-shopping' });
    });

    Then('process instance key is returned', () => {
      expect(startResponse.statusCode, startResponse.text).to.equal(200);
      expect(startResponse.body).to.have.property('processInstanceKey');
    });
  });

  Scenario('modeler deploys with tenant id', () => {
    let response;
    When('modeler deploys diagram with tenant id', async () => {
      const form = new FormData();
      form.append('resources', modelerSource, { filename: 'tenant-shopping.bpmn', contentType: 'application/octet-stream' });
      form.append('tenantId', 'tenant-a');
      response = await apps.request().post('/rest/v2/deployments').set(form.getHeaders()).send(form.getBuffer().toString());
    });

    Then('tenant id is echoed', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('tenantId', 'tenant-a');
      expect(response.body.deployments[0].processDefinition).to.have.property('tenantId', 'tenant-a');
    });
  });

  Scenario('modeler requests that cannot be fulfilled', () => {
    let response;
    When('modeler starts an instance of an unknown process id', async () => {
      response = await apps.request().post('/rest/v2/process-instances').send({ processDefinitionId: 'unknown-process' });
    });

    Then('not found is returned', () => {
      expect(response.statusCode, response.text).to.equal(404);
    });

    When('an instance is started without process definition id', async () => {
      response = await apps.request().post('/rest/v2/process-instances').send({ variables: {} });
    });

    Then('bad request is returned', () => {
      expect(response.statusCode, response.text).to.equal(400);
    });

    When('an instance is started without a body', async () => {
      response = await apps.request().post('/rest/v2/process-instances');
    });

    Then('bad request is returned', () => {
      expect(response.statusCode, response.text).to.equal(400);
    });

    When('modeler deploys without resources', async () => {
      const form = new FormData();
      form.append('tenantId', '<default>');
      response = await apps.request().post('/rest/v2/deployments').set(form.getHeaders()).send(form.getBuffer().toString());
    });

    Then('bad request is returned', () => {
      expect(response.statusCode, response.text).to.equal(400);
    });

    When('modeler deploys a malformed diagram', async () => {
      const form = new FormData();
      form.append('resources', '<definitions', { filename: 'broken.bpmn', contentType: 'application/octet-stream' });
      response = await apps.request().post('/rest/v2/deployments').set(form.getHeaders()).send(form.getBuffer().toString());
    });

    Then('bad request is returned', () => {
      expect(response.statusCode, response.text).to.equal(400);
    });
  });

  Scenario('modeler starts an instance with business id', () => {
    let response;
    When('modeler starts an instance with a business id', async () => {
      response = await apps
        .request()
        .post('/rest/v2/process-instances')
        .send({ processDefinitionId: 'modeler-shopping-process', businessId: 'order-1', variables: { foo: 'bar' } });
    });

    Then('the instance is started', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('processInstanceKey').that.is.ok;
    });

    And('the business id is kept as business key on the running instance', async () => {
      const status = await apps.request().get(`/rest/status/${response.body.processInstanceKey}`).expect(200);
      expect(status.body).to.have.property('businessKey', 'order-1');
    });
  });

  Scenario('process definition record lacks deployment name', () => {
    Given('a diagram is deployed the classic way', () => {
      return createDeployment(apps.balance(), 'legacy-shopping', modelerSource);
    });

    And('a process definition record without deployment name is stored under the deployment name', () => {
      return apps.balance().locals.engines.adapter.upsert(STORAGE_TYPE_PROCESS_DEFINITION, 'legacy-shopping', {});
    });

    let response;
    When('modeler starts an instance by process definition id', async () => {
      response = await apps.request().post('/rest/v2/process-instances').send({ processDefinitionId: 'legacy-shopping' });
    });

    Then('the deployment name falls back to the process definition id and the instance is started', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('processDefinitionId', 'legacy-shopping');
      expect(response.body).to.have.property('processInstanceKey').that.is.ok;
    });

    And('the instance is running', () => {
      expect(apps.getRunningByToken(response.body.processInstanceKey)).to.have.length(1);
    });
  });
});

Feature('assign output of unextended elements', () => {
  let apps;
  before('two app instances with assignOutput auto', () => {
    apps = horizontallyScaled(2, { engineOptions: { settings: { assignOutput: 'auto' } } });
  });
  after(() => apps.stop());

  Scenario('bare user task is signalled with a payload', () => {
    let wait, startResponse;
    Given('a diagram with a user task without extension elements is deployed and started', async () => {
      const form = new FormData();
      form.append('resources', modelerSource, { filename: 'bare-user-task.bpmn', contentType: 'application/octet-stream' });
      await request(apps.apps[0]).post('/rest/v2/deployments').set(form.getHeaders()).send(form.getBuffer().toString()).expect(200);

      wait = waitForProcess(apps.apps[1], 'bare-user-task').wait();
      startResponse = await request(apps.apps[1])
        .post('/rest/v2/process-instances')
        .send({ processDefinitionKey: 'bare-user-task' })
        .expect(200);
    });

    let end;
    When('user task is signalled with a payload on the other instance', async () => {
      const waitingTask = await wait;
      const token = startResponse.body.processInstanceKey;
      end = waitForProcess(apps.apps[0], token).end();

      return request(apps.apps[0])
        .post(`/rest/signal/${token}`)
        .send({ id: waitingTask.content.id, message: { approved: true } })
        .expect(200);
    });

    Then('run completes with the signal payload as output', async () => {
      await end;
      const { body } = await apps.request().get(`/rest/state/${startResponse.body.processInstanceKey}`).expect(200);
      expect(body.engine.environment.output).to.deep.equal({ message: { approved: true } });
    });
  });
});

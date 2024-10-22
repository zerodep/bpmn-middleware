import request from 'supertest';

import { MemoryAdapter } from '../../src/index.js';
import { createDeployment, horizontallyScaled, getResource, waitForProcess } from '../helpers/testHelpers.js';
import { factory as ScriptsFactory } from '../../example/middleware-scripts.js';

const externalScriptSource = getResource('script-resource.bpmn');

Feature('scripts', () => {
  let apps, adapter;
  before(() => {
    adapter = new MemoryAdapter();
    apps = horizontallyScaled(2, { adapter });
  });
  after(() => apps.stop());

  Scenario('process with scripts', () => {
    Given('a process with two script tasks', () => {
      return createDeployment(
        apps.balance(),
        'scripts-process',
        `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="main-process" isExecutable="true">
            <startEvent id="start" />
            <sequenceFlow id="to-script1" sourceRef="start" targetRef="script1">
                <conditionExpression xsi:type="tFormalExpression" language="JavaScript"><![CDATA[
                next(null, this.environment.variables.input <= 50);
                ]]></conditionExpression>
            </sequenceFlow>
            <sequenceFlow id="to-script2" sourceRef="start" targetRef="script2" />
            <scriptTask id="script1" scriptFormat="javascript">
              <script>next(null, 1);</script>
            </scriptTask>
            <scriptTask id="script2" scriptFormat="javascript">
              <script>next(null, 2);</script>
            </scriptTask>
            <sequenceFlow id="from-script1" sourceRef="script1" targetRef="service-task" />
            <sequenceFlow id="from-script2" sourceRef="script2" targetRef="service-task" />
            <serviceTask id="service-task">
              <extensionElements>
                <camunda:connector>
                  <camunda:connectorId>apiRequest</camunda:connectorId>
                  <camunda:inputOutput>
                    <camunda:inputParameter name="method">GET</camunda:inputParameter>
                    <camunda:inputParameter name="url">/my/items</camunda:inputParameter>
                    <camunda:outputParameter name="result">
                      <camunda:script scriptFormat="js">
                        next(null, {
                          id: content.id,
                          statuscode,
                        });
                      </camunda:script>
                    </camunda:outputParameter>
                  </camunda:inputOutput>
                </camunda:connector>
                <camunda:inputOutput>
                  <camunda:outputParameter name="result">\${content.output.result.statuscode}</camunda:outputParameter>
                </camunda:inputOutput>
              </extensionElements>
            </serviceTask>
            <sequenceFlow id="to-end" sourceRef="service-task" targetRef="end" />
            <endEvent id="end" />
          </process>
        </definitions>`
      );
    });

    let response;
    When('scripts endpoint is called', async () => {
      const app = apps.balance();
      response = await request(app)
        .get('/rest/script/scripts-process')
        .expect(200)
        .expect('content-type', 'text/javascript; charset=utf-8');
    });

    And('scripts are returned', () => {
      expect(response.text).to.contain(`export function scripts_process_script1(`);
    });

    When('scripts endpoint is called with unknown deployment', async () => {
      const app = apps.balance();
      response = await request(app).get('/rest/script/unknown-process');
    });

    Then('404 not found is returned', () => {
      expect(response.statusCode, response.text).to.equal(404);
    });
  });

  Scenario('pass Scripts handler option', () => {
    let apps, adapter;
    before(() => {
      adapter = new MemoryAdapter();
    });
    after(() => apps?.stop());

    let scriptsArgs;
    Given('apps are started with Scripts factory option', () => {
      apps = horizontallyScaled(2, {
        adapter,
        Scripts(...args) {
          scriptsArgs = args;
          return ScriptsFactory(...args);
        },
      });
    });

    let deploymentName;
    And('a process with external script is deployed', () => {
      deploymentName = 'external-scripts-process';
      return createDeployment(apps.balance(), deploymentName, externalScriptSource, ['./test/resources/diagramscript.cjs']);
    });

    let response;
    let token;
    let app;
    let wait, end;
    When('process is started', async () => {
      app = apps.balance();
      wait = waitForProcess(app, deploymentName).wait();

      response = await request(app).post(`/rest/process-definition/${deploymentName}/start`).send({ businessKey: 'foo' }).expect(201);
      token = response.body.id;
    });

    And('scripts factory received expected arguments', () => {
      expect(scriptsArgs.splice(0)).to.deep.equal([adapter, deploymentName, 'foo']);
    });

    And('manual task is signalled from same app', async () => {
      const waitingTask = await wait;
      end = waitForProcess(app, deploymentName).end();

      await request(app).post(`/rest/signal/${token}`).send({ id: waitingTask.content.id }).expect(200);
    });

    Then('run completes in the same app', () => {
      return end;
    });

    And('output is as expected', async () => {
      response = await apps.request().get(`/rest/state/${token}`).expect(200);
      expect(response.body.engine.environment.output.res).to.deep.equal({ external: true });
    });

    When('process is started again', async () => {
      app = apps.balance();
      wait = waitForProcess(app, deploymentName).wait();

      response = await request(app).post(`/rest/process-definition/${deploymentName}/start`).send({ businessKey: 'bar' }).expect(201);
      token = response.body.id;
    });

    And('manual task is signalled from another app instance', async () => {
      const waitingTask = await wait;
      app = apps.balance();
      end = waitForProcess(app, deploymentName).end();

      await request(app).post(`/rest/signal/${token}`).send({ id: waitingTask.content.id }).expect(200);
    });

    Then('run completes', () => {
      return end;
    });

    And('output is as expected', async () => {
      response = await apps.request().get(`/rest/state/${token}`).expect(200);
      expect(response.body.engine.environment.output.res).to.deep.equal({ external: true });
    });

    And('scripts factory received expected arguments', () => {
      expect(scriptsArgs).to.deep.equal([adapter, deploymentName, 'bar']);
    });
  });

  Scenario('invalid source', () => {
    let deploymentName;
    Given('a source matching scenario is deployed', async () => {
      deploymentName = 'bad-source';
      await createDeployment(apps.balance(), deploymentName, '<bpmn/>');
    });

    let response;
    When('scripts endpoint is called with unknown deployment', async () => {
      const app = apps.balance();
      response = await request(app).get('/rest/script/bad-source');
    });

    Then('bad gateway is returned', () => {
      expect(response.statusCode, response.text).to.equal(502);
    });
  });
});

import request from 'supertest';

import { createDeployment, horizontallyScaled } from '../helpers/testHelpers.js';
import { MemoryAdapter } from '../../src/index.js';

Feature('scripts', () => {
  Scenario('process with scripts', () => {
    let apps, adapter;
    before(() => {
      adapter = new MemoryAdapter();
      apps = horizontallyScaled(2, { adapter });
    });
    after(() => apps.stop());

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
        </definitions>`,
      );
    });

    let response;
    When('when scripts endpoint is called', async () => {
      const app = apps.balance();
      response = await request(app)
        .get('/rest/script/scripts-process')
        .expect(200)
        .expect('content-type', 'text/javascript; charset=utf-8');
    });

    And('scripts are returned', () => {
      expect(response.text).to.contain(`export function scripts_process_script1(`);
    });

    When('when scripts endpoint is called with unknown deployment', async () => {
      const app = apps.balance();
      response = await request(app).get('/rest/script/unknown-process');
    });

    Then('404 not found is returned', () => {
      expect(response.statusCode, response.text).to.equal(404);
    });
  });
});

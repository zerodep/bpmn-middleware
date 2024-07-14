import request from 'supertest';

import { createDeployment, getExampleApp, getResource, waitForProcess } from '../helpers/testHelpers.js';

const externalScriptSource = getResource('script-resource.bpmn');

Feature('example app', () => {
  Scenario('flow with external script', () => {
    let app;
    Given('example app is started', async () => {
      app = await getExampleApp();
    });

    let deploymentName;
    And('a process with external script is deployed', () => {
      deploymentName = 'external-scripts-process';
      return createDeployment(app, deploymentName, externalScriptSource, ['./test/resources/diagramscript.cjs']);
    });

    let end;
    When('when process is started', async () => {
      end = waitForProcess(app, deploymentName).end();

      await request(app).post(`/rest/process-definition/${deploymentName}/start`).expect(201);
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
        ['./test/resources/save-state.bpmn']
      );
    });

    let fail;
    When('when process is started', async () => {
      fail = waitForProcess(app, deploymentName).error();

      await request(app).post(`/rest/process-definition/${deploymentName}/start`).expect(201);
    });

    Then('run fails with syntax error', async () => {
      const err = await fail;
      expect(err.toString()).to.contain('SyntaxError');
    });
  });
});

import request from 'supertest';
import FormData from 'form-data';

import { createDeployment, getExampleApp, getExampleResource, waitForProcess } from '../helpers/test-helpers.js';

const decisionsSource = getExampleResource('dinner.dmn');
const processSource = getExampleResource('dinner.bpmn');

Feature('example app decisions', () => {
  let app;
  before('example app is started', async () => {
    app = await getExampleApp();
  });
  after(() => request(app).delete('/rest/internal/stop').expect(204));

  Scenario('evaluate a deployed DMN decision table via endpoint', () => {
    Given('a DMN decision table is deployed', async () => {
      await createDecisionDeployment(app, 'dinner-decisions', 'dinner.dmn', decisionsSource);
    });

    let response;
    When('decision is evaluated with season Winter', async () => {
      response = await request(app).post('/decision/dinner-decisions/dish').send({ Season: 'Winter' });
    });

    Then('decision result with evaluation trace is returned', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('result', 'Roast beef');
      expect(response.body).to.have.property('trace').that.is.an('array');

      const decisionTrace = response.body.trace.find((traced) => traced.id === 'dish');
      expect(decisionTrace, 'dish trace').to.be.ok;
      expect(decisionTrace).to.have.property('hitPolicy', 'FIRST');
      expect(decisionTrace).to.have.property('matchedRules').that.deep.equal(['winterRule', 'anySeasonRule']);
      expect(decisionTrace).to.have.property('result', 'Roast beef');
    });

    When('decision is evaluated with season Summer', async () => {
      response = await request(app).post('/decision/dinner-decisions/dish').send({ Season: 'Summer' });
    });

    Then('fallback decision result with evaluation trace is returned', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('result', 'Light salad');

      const decisionTrace = response.body.trace.find((traced) => traced.id === 'dish');
      expect(decisionTrace, 'dish trace').to.be.ok;
      expect(decisionTrace).to.have.property('matchedRules').that.deep.equal(['anySeasonRule']);
    });

    When('a non-deployed decision table is evaluated', async () => {
      response = await request(app).post('/decision/vegan-decisions/dish').send({ Season: 'Winter' });
    });

    Then('not found is rendered', () => {
      expect(response.statusCode, response.text).to.equal(404);
      expect(response.body.message).to.contain('vegan-decisions');
    });

    When('an unknown decision of a deployed decision table is evaluated', async () => {
      response = await request(app).post('/decision/dinner-decisions/dessert').send({ Season: 'Winter' });
    });

    Then('not found is rendered', () => {
      expect(response.statusCode, response.text).to.equal(404);
      expect(response.body.message).to.contain('dessert');
    });

    Given('a deployment without decisions', () => {
      return createDeployment(app, 'no-decisions', processSource);
    });

    When('a decision is evaluated from the deployment without decisions', async () => {
      response = await request(app).post('/decision/no-decisions/dish').send({ Season: 'Winter' });
    });

    Then('not found is rendered', () => {
      expect(response.statusCode, response.text).to.equal(404);
      expect(response.body.message).to.contain('no-decisions');
    });
  });

  Scenario('business rule task evaluates deployed decision', () => {
    Given('a DMN decision table is deployed', async () => {
      await createDecisionDeployment(app, 'dinner-decisions', 'dinner.dmn', decisionsSource);
    });

    And('a process with a business rule task pointing to the deployed decision is deployed', () => {
      return createDeployment(app, 'dinner-process', processSource);
    });

    let response;
    When('process is started with season Winter', async () => {
      response = await request(app)
        .post('/start/sync/dinner-process')
        .send({ variables: { Season: 'Winter' } });
    });

    Then('run completes with decision result in output', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('output').that.deep.equal({ dish: 'Roast beef' });
    });

    When('process is started with season Summer', async () => {
      response = await request(app)
        .post('/start/sync/dinner-process')
        .send({ variables: { Season: 'Summer' } });
    });

    Then('run completes with fallback decision result in output', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('output').that.deep.equal({ dish: 'Light salad' });
    });
  });

  Scenario('Camunda 8 business rule task evaluates deployed decision', () => {
    Given('a DMN decision table is deployed', async () => {
      await createDecisionDeployment(app, 'dinner-decisions', 'dinner.dmn', decisionsSource);
    });

    And('a Camunda 8 process with a business rule task pointing to the deployed decision is deployed', () => {
      return createDeployment(app, 'camunda8-dinner', getExampleResource('camunda8-dinner.bpmn'));
    });

    let response;
    When('process is started with season Winter', async () => {
      response = await request(app)
        .post('/start/sync/camunda8-dinner')
        .send({ variables: { Season: 'Winter' } });
    });

    Then('run completes with decision result in output', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('output').that.deep.equal({ dish: 'Roast beef' });
    });
  });

  Scenario('business rule task referencing a non-deployed decision table', () => {
    let deploymentName;
    Given('a process with a business rule task pointing to a non-deployed decision is deployed', () => {
      deploymentName = 'vegan-process';
      return createDeployment(
        app,
        deploymentName,
        `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
          id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
          <process id="Process_1" isExecutable="true">
            <businessRuleTask id="decideDish" camunda:decisionRef="vegan-decisions/dish" camunda:resultVariable="dish" />
          </process>
        </definitions>`
      );
    });

    let fail;
    When('process is started', async () => {
      fail = waitForProcess(app, deploymentName).error();
      await request(app).post(`/rest/process-definition/${deploymentName}/start`).expect(201);
    });

    Then('run fails with non-deployed decision error', async () => {
      const err = await fail;
      expect(err.toString()).to.contain('vegan-decisions');
    });
  });

  Scenario('business rule task without decision reference', () => {
    let deploymentName;
    Given('a process with a business rule task lacking decisionRef is deployed', () => {
      deploymentName = 'undecided-process';
      return createDeployment(
        app,
        deploymentName,
        `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
          id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
          <process id="Process_1" isExecutable="true">
            <businessRuleTask id="decideDish" camunda:resultVariable="dish" />
          </process>
        </definitions>`
      );
    });

    let fail;
    When('process is started', async () => {
      fail = waitForProcess(app, deploymentName).error();
      await request(app).post(`/rest/process-definition/${deploymentName}/start`).expect(201);
    });

    Then('run fails with decisionRef required error', async () => {
      const err = await fail;
      expect(err.toString()).to.contain('decisionRef');
    });
  });
});

/**
 * Create deployment with a DMN file
 * @param {import('express').Express} app
 * @param {string} name deployment name
 * @param {string} fileName DMN file name
 * @param {string | Buffer} source DMN source
 */
function createDecisionDeployment(app, name, fileName, source) {
  const form = new FormData();
  form.append('deployment-name', name);
  form.append('deployment-source', 'Test modeler');
  form.append(fileName, source, { filename: fileName, contentType: 'application/octet-stream' });
  return request(app).post('/rest/deployment/create').set(form.getHeaders()).send(form.getBuffer().toString()).expect(201);
}

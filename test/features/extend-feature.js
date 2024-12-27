import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { json } from 'express';

import { MiddlewareEngine } from '../../src/index.js';
import * as testHelpers from '../helpers/test-helpers.js';

class ExtendedEngine extends MiddlewareEngine {}

Feature('extend middleware', () => {
  Scenario('set engine token', () => {
    let app;
    after(() => {
      return request(app).delete('/rest/internal/stop').expect(204);
    });

    Given('app is started with token middleware', () => {
      app = testHelpers.getAppWithExtensions();
      app.post('/extend/rest/process-definition/:deploymentName/start', json(), (req, res, next) => {
        if (req.body.token) {
          res.locals.token = req.body.token;
        }
        next();
      });
      app.use('/extend/rest', app.locals.middleware);
    });

    let deploymentName;
    And('a process is deployed', () => {
      deploymentName = 'pre-set-token';
      return testHelpers.createDeployment(
        app,
        deploymentName,
        `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
          id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
          <process id="Process_1" isExecutable="true">
            <task id="task" />
          </process>
        </definitions>`
      );
    });

    let response, token;
    When('process is started with token from body', async () => {
      token = randomUUID();
      response = await request(app).post(`/extend/rest/process-definition/${deploymentName}/start`).send({ token }).expect(201);
    });

    Then('token is used to start engine', () => {
      expect(response.body, response.text).to.have.property('id', token);
    });

    When('process is started with object token from body', async () => {
      token = { id: randomUUID() };
      response = await request(app).post(`/extend/rest/process-definition/${deploymentName}/start`).send({ token }).expect(201);
    });

    Then('token is NOT used to start engine', () => {
      expect(response.body, response.text).to.have.property('id').that.is.not.equal(token);
    });
  });

  Scenario('pre-create engine', () => {
    let app;

    after(() => {
      return request(app).delete('/rest/internal/stop').expect(204);
    });

    Given('app is started with create engine middleware', () => {
      app = testHelpers.getAppWithExtensions({ autosaveEngineState: true });
      app.post('/extend/rest/process-definition/:deploymentName/start', json(), (_req, res, next) => {
        res.locals.engine = new ExtendedEngine(randomUUID(), {
          name: 'static',
          source: `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
            id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
            <process id="Process_1" isExecutable="true">
              <task id="task" />
            </process>
          </definitions>`,
          settings: {
            autosaveEngineState: true,
          },
        });
        next();
      });
      app.use('/extend/rest', app.locals.middleware);
    });

    let response, token;
    When('process is started', async () => {
      response = await request(app).post('/extend/rest/process-definition/anything/start').expect(201);
      token = response.body.id;
    });

    Then('created engine is used', async () => {
      response = await request(app)
        .get('/extend/rest/status/' + token)
        .expect(200);

      expect(response.body, response.text).to.have.property('name', 'static');
    });

    Given('an app with bad engine middleware', () => {
      app.post('/bad-extend/rest/process-definition/:deploymentName/start', json(), (req, res, next) => {
        res.locals.engine = req.body.engine;
        next();
      });
      app.use('/bad-extend/rest', app.locals.middleware);
      app.use(testHelpers.errorHandler);
    });

    When('process is started addressing bad middleware', async () => {
      response = await request(app).post('/bad-extend/rest/process-definition/anything/start').send({ engine: {} });
    });

    Then('404 is returned', () => {
      expect(response.status, response.text).to.equal(404);
      expect(response.text).to.match(/anything/i);
    });

    When('process is started addressing bad middleware with string', async () => {
      response = await request(app).post('/bad-extend/rest/process-definition/anything/start').send({ engine: '{}' });
    });

    Then('404 is returned', () => {
      expect(response.status, response.text).to.equal(404);
      expect(response.text).to.match(/anything/i);
    });
  });
});

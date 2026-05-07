import request from 'supertest';

import { getExampleApp } from '../helpers/test-helpers.js';

Feature('example app exposes a pre-built OpenAPI document', () => {
  let app;
  before('example app is started', async () => {
    app = await getExampleApp();
  });

  Scenario('GET /swagger.json returns the pre-built OpenAPI 3 document', () => {
    let response;
    When('GET /swagger.json is called', async () => {
      response = await request(app).get('/swagger.json');
    });

    Then('a 200 response is returned with an OpenAPI 3 document', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('openapi').that.match(/^3\./);
    });

    And('the document carries an info block with title and version', () => {
      expect(response.body).to.have.property('info');
      expect(response.body.info).to.have.property('title').that.is.a('string');
      expect(response.body.info).to.have.property('version').that.is.a('string');
    });

    And('the document carries a paths object', () => {
      expect(response.body).to.have.property('paths').that.is.an('object');
    });

    And('the document carries a components.schemas object', () => {
      expect(response.body).to.have.property('components').that.is.an('object');
      expect(response.body.components).to.have.property('schemas').that.is.an('object');
    });
  });

  Scenario('the OpenAPI document carries the BPMN middleware models', () => {
    let doc;
    Given('the pre-built OpenAPI document', async () => {
      const response = await request(app).get('/swagger.json').expect(200);
      doc = response.body;
    });

    Then('components.schemas contains StartDeploymentResult', () => {
      expect(doc.components.schemas).to.have.property('StartDeploymentResult');
      expect(doc.components.schemas.StartDeploymentResult).to.have.property('type', 'object');
      expect(doc.components.schemas.StartDeploymentResult).to.have.nested.property('properties.id');
    });

    And('components.schemas contains MiddlewareEngineStatus', () => {
      expect(doc.components.schemas).to.have.property('MiddlewareEngineStatus');
      expect(doc.components.schemas.MiddlewareEngineStatus).to.have.nested.property('properties.token');
      expect(doc.components.schemas.MiddlewareEngineStatus).to.have.nested.property('properties.name');
    });

    And('components.schemas contains MiddlewareEngineState', () => {
      expect(doc.components.schemas).to.have.property('MiddlewareEngineState');
    });

    And('components.schemas contains SignalBody', () => {
      expect(doc.components.schemas).to.have.property('SignalBody');
    });

    And('components.schemas contains StartDeploymentOptions', () => {
      expect(doc.components.schemas).to.have.property('StartDeploymentOptions');
    });

    And('ExecuteOptions properties are expanded as query parameters on resume', () => {
      const params = doc.paths['/rest/resume/{token}'].post.parameters;
      const names = params.filter((p) => p.in === 'query').map((p) => p.name);
      expect(names).to.include.members(['autosaveEngineState', 'sync', 'idleTimeout', 'resumedBy']);
    });

    And('components.schemas contains Caller with the documented fields', () => {
      expect(doc.components.schemas).to.have.property('Caller');
      const caller = doc.components.schemas.Caller;
      expect(caller).to.have.nested.property('properties.token');
      expect(caller).to.have.nested.property('properties.deployment');
      expect(caller).to.have.nested.property('properties.id');
      expect(caller).to.have.nested.property('properties.executionId');
    });
  });

  Scenario('the OpenAPI document describes the example app custom routes', () => {
    let doc;
    Given('the pre-built OpenAPI document', async () => {
      const response = await request(app).get('/swagger.json').expect(200);
      doc = response.body;
    });

    Then('POST /rest/process-definition/{deploymentName}/start is described', () => {
      const path = doc.paths['/rest/process-definition/{deploymentName}/start'];
      expect(path, 'POST /rest/process-definition/{deploymentName}/start').to.be.an('object');
      expect(path).to.have.property('post');
    });

    And('POST /rest/signal/{token} is described', () => {
      const path = doc.paths['/rest/signal/{token}'];
      expect(path, 'POST /rest/signal/{token}').to.be.an('object');
      expect(path).to.have.property('post');
    });

    And('GET /rest/state/{token} is described', () => {
      const path = doc.paths['/rest/state/{token}'];
      expect(path, 'GET /rest/state/{token}').to.be.an('object');
      expect(path).to.have.property('get');
    });

    And('POST /signal/{token} (custom example route) is described', () => {
      const path = doc.paths['/signal/{token}'];
      expect(path, 'POST /signal/{token}').to.be.an('object');
      expect(path).to.have.property('post');
    });
  });

  Scenario('the OpenAPI document links operation bodies to model schemas', () => {
    let doc;
    Given('the pre-built OpenAPI document', async () => {
      const response = await request(app).get('/swagger.json').expect(200);
      doc = response.body;
    });

    Then('POST /signal/{token} request body refs SignalBody', () => {
      const schema = doc.paths['/signal/{token}'].post.requestBody.content['application/json'].schema;
      expect(schema).to.deep.equal({ $ref: '#/components/schemas/SignalBody' });
    });

    And('POST /signal/{token} response refs MiddlewareEngineState', () => {
      const schema = doc.paths['/signal/{token}'].post.responses['200'].content['application/json'].schema;
      expect(schema).to.deep.equal({ $ref: '#/components/schemas/MiddlewareEngineState' });
    });

    And('POST /rest/deployment/create response refs CreateDeploymentResponseBody', () => {
      const schema = doc.paths['/rest/deployment/create'].post.responses['200'].content['application/json'].schema;
      expect(schema).to.deep.equal({ $ref: '#/components/schemas/CreateDeploymentResponseBody' });
    });

    And('GET /rest/version emits the version body inline', () => {
      const schema = doc.paths['/rest/version'].get.responses['200'].content['application/json'].schema;
      expect(schema).to.have.nested.property('properties.version.type', 'string');
    });

    And('GET /rest/deployment emits the deployment-name body inline', () => {
      const schema = doc.paths['/rest/deployment'].get.responses['200'].content['application/json'].schema;
      expect(schema).to.have.nested.property('properties.name.type', 'string');
    });
  });

  Scenario('example app routes wired through generic handlers reach proper schemas', () => {
    let doc;
    Given('the pre-built OpenAPI document', async () => {
      const response = await request(app).get('/swagger.json').expect(200);
      doc = response.body;
    });

    Then('POST /rest/auth/process-definition/{deploymentName}/start request body refs StartDeploymentOptions', () => {
      const op = doc.paths['/rest/auth/process-definition/{deploymentName}/start'].post;
      expect(op.requestBody.content['application/json'].schema).to.deep.equal({
        $ref: '#/components/schemas/StartDeploymentOptions',
      });
    });

    And('POST /rest/auth/process-definition/{deploymentName}/start response refs StartDeploymentResult', () => {
      const op = doc.paths['/rest/auth/process-definition/{deploymentName}/start'].post;
      expect(op.responses['200'].content['application/json'].schema).to.deep.equal({
        $ref: '#/components/schemas/StartDeploymentResult',
      });
    });

    And('POST /start/sync/{deploymentName} request body refs StartDeploymentOptions', () => {
      const op = doc.paths['/start/sync/{deploymentName}'].post;
      expect(op.requestBody.content['application/json'].schema).to.deep.equal({
        $ref: '#/components/schemas/StartDeploymentOptions',
      });
    });

    And('POST /start/sync/{deploymentName} response declares token and output fields', () => {
      const schema = doc.paths['/start/sync/{deploymentName}'].post.responses['200'].content['application/json'].schema;
      const resolved = schema.$ref ? doc.components.schemas[schema.$ref.split('/').pop()] : schema;
      expect(resolved).to.have.nested.property('properties.token.type', 'string');
      expect(resolved).to.have.nested.property('properties.output');
    });

    And('GET /swagger.json is excluded from the OpenAPI document', () => {
      expect(doc.paths).to.not.have.property('/swagger.json');
    });
  });

  Scenario('engine state and running queries reference named schemas', () => {
    let doc;
    Given('the pre-built OpenAPI document', async () => {
      const response = await request(app).get('/swagger.json').expect(200);
      doc = response.body;
    });

    Then('GET /rest/state/{token} response refs MiddlewareEngineState', () => {
      const schema = doc.paths['/rest/state/{token}'].get.responses['200'].content['application/json'].schema;
      expect(schema).to.deep.equal({ $ref: '#/components/schemas/MiddlewareEngineState' });
    });

    And('GET /rest/status/{token} response refs MiddlewareEngineStatus', () => {
      const schema = doc.paths['/rest/status/{token}'].get.responses['200'].content['application/json'].schema;
      expect(schema).to.deep.equal({ $ref: '#/components/schemas/MiddlewareEngineStatus' });
    });

    And('GET /rest/running response engines field is an array of MiddlewareEngineState', () => {
      const schema = doc.paths['/rest/running'].get.responses['200'].content['application/json'].schema;
      const engines = (schema.$ref ? doc.components.schemas[schema.$ref.split('/').pop()] : schema).properties.engines;
      expect(engines.type).to.equal('array');
      expect(engines.items).to.deep.equal({ $ref: '#/components/schemas/MiddlewareEngineState' });
    });
  });

  Scenario('non-JSON content types are declared via brand types', () => {
    let doc;
    Given('the pre-built OpenAPI document', async () => {
      const response = await request(app).get('/swagger.json').expect(200);
      doc = response.body;
    });

    Then('POST /rest/deployment/create requestBody is keyed by multipart/form-data', () => {
      const content = doc.paths['/rest/deployment/create'].post.requestBody.content;
      expect(content).to.have.property('multipart/form-data');
      expect(content).to.not.have.property('application/json');
    });

    And('the multipart schema declares the deployment-name field as required string', () => {
      const ref = doc.paths['/rest/deployment/create'].post.requestBody.content['multipart/form-data'].schema.$ref;
      expect(ref).to.equal('#/components/schemas/CreateDeploymentForm');
      const form = doc.components.schemas.CreateDeploymentForm;
      expect(form.properties['deployment-name']).to.deep.equal({ type: 'string' });
      expect(form.required).to.include('deployment-name');
    });

    And('the multipart schema declares a binary file field', () => {
      const form = doc.components.schemas.CreateDeploymentForm;
      expect(form.properties.file).to.deep.equal({ type: 'string', format: 'binary' });
    });

    And('GET /rest/script/{deploymentName} response is keyed by text/javascript', () => {
      const content = doc.paths['/rest/script/{deploymentName}'].get.responses['200'].content;
      expect(content).to.have.property('text/javascript');
      expect(content).to.not.have.property('application/json');
    });
  });

  Scenario('internal middleware endpoints are excluded from the OpenAPI document', () => {
    let doc;
    Given('the pre-built OpenAPI document', async () => {
      const response = await request(app).get('/swagger.json').expect(200);
      doc = response.body;
    });

    Then('DELETE /rest/internal/stop is not described', () => {
      expect(doc.paths).to.not.have.property('/rest/internal/stop');
    });

    And('DELETE /rest/internal/stop/{token} is not described', () => {
      expect(doc.paths).to.not.have.property('/rest/internal/stop/{token}');
    });
  });

  Scenario('DELETE endpoints that respond with 204 omit the success body', () => {
    let doc;
    Given('the pre-built OpenAPI document', async () => {
      const response = await request(app).get('/swagger.json').expect(200);
      doc = response.body;
    });

    Then('DELETE /rest/state/{token} declares a bodyless 204 success', () => {
      const op = doc.paths['/rest/state/{token}'].delete;
      expect(op.responses).to.have.property('204');
      expect(op.responses['204']).to.not.have.property('content');
      expect(op.responses).to.not.have.property('200');
    });
  });
});

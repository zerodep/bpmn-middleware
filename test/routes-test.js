import { createRequire } from 'node:module';
import FormData from 'form-data';
import request from 'supertest';
import * as ck from 'chronokinesis';

import { createDeployment, getAppWithExtensions, horizontallyScaled } from './helpers/test-helpers.js';
import { MemoryAdapter, STORAGE_TYPE_STATE, STORAGE_TYPE_FILE } from '../src/index.js';

const nodeRequire = createRequire(import.meta.url);
const packageInfo = nodeRequire('../package.json');

describe('routes', () => {
  let apps, adapter;
  before('two parallel app instances with a shared adapter source', () => {
    adapter = new MemoryAdapter();
    apps = horizontallyScaled(2, { adapter });
    return createDeployment(
      apps.balance(),
      'test-process',
      `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp1" isExecutable="true">
          <userTask id="task" />
        </process>
      </definitions>`
    );
  });
  after(() => apps.stop());
  afterEach(ck.reset);

  describe('GET (*splat)/version', () => {
    it('returns package version', () => {
      return apps.request().get('/rest/version').expect(200).expect({ version: packageInfo.version });
    });
  });

  describe('GET (*splat)/deployment', () => {
    it('returns package name', () => {
      return apps.request().get('/rest/deployment').expect(200).expect({ name: packageInfo.name });
    });
  });

  describe('POST (*splat)/deployment/create', () => {
    it('returns deployment', async () => {
      ck.freeze();

      const name = 'test-name';

      const form = new FormData();
      form.append('deployment-name', name);
      form.append('deployment-source', 'Test modeler');
      form.append(
        `${name}.bpmn`,
        `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="called-deployment" isExecutable="true">
          <task id="task" />
        </process>
      </definitions>`,
        `${name}.bpmn`
      );

      const response = await apps
        .request()
        .post('/rest/deployment/create')
        .set(form.getHeaders())
        .send(form.getBuffer().toString())
        .expect(201);

      expect(response.body).to.deep.equal({
        deployedProcessDefinitions: { 'test-name': { id: 'test-name' } },
        deploymentTime: new Date().toISOString(),
        id: 'test-name',
      });
    });

    it('returns bad request if no deployment name', () => {
      const name = 'test-name';

      const form = new FormData();
      form.append('deployment-source', 'Test modeler');
      form.append(
        `${name}.bpmn`,
        `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="called-deployment" isExecutable="true">
          <task id="task" />
        </process>
      </definitions>`,
        `${name}.bpmn`
      );

      return apps
        .request()
        .post('/rest/deployment/create')
        .set(form.getHeaders())
        .send(form.getBuffer().toString())
        .expect(400)
        .expect({ message: 'deployment-name is required' });
    });

    it('returns bad request if no files', () => {
      const name = 'test-name';

      const form = new FormData();
      form.append('deployment-name', name);
      form.append('deployment-source', 'Test modeler');

      return apps
        .request()
        .post('/rest/deployment/create')
        .set(form.getHeaders())
        .send(form.getBuffer().toString())
        .expect(400)
        .expect({ message: `Cannot create deployment ${name} without files` });
    });
  });

  describe('POST (*splat)/process-definition/:deploymentName/start', () => {
    it('returns 404 if deployment is not found', () => {
      return apps
        .request()
        .post('/rest/process-definition/no-test-process/start')
        .expect(404)
        .expect({ message: 'Deployment no-test-process not found' });
    });

    it('returns 502 if adapter fails to fetch file', async () => {
      class VolatileAdapter extends MemoryAdapter {
        fetch(type, key, options) {
          if (type === STORAGE_TYPE_FILE) {
            return Promise.reject(new Error('DB file error'));
          } else {
            return super.fetch(type, key, options);
          }
        }
      }

      const app = getAppWithExtensions({ adapter: new VolatileAdapter() });

      await createDeployment(
        app,
        'test-process',
        `
      <definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp1" isExecutable="true">
          <userTask id="task" />
        </process>
      </definitions>`
      );

      return request(app).post('/rest/process-definition/test-process/start').expect(502).expect({ message: 'DB file error' });
    });
  });

  describe('GET (*splat)/running', () => {
    it('returns running engines status but not engine state', async () => {
      await apps.request().post('/rest/process-definition/test-process/start').expect(201);

      const response = await apps.request().get('/rest/running');

      expect(response.statusCode, response.text).to.equal(200);

      expect(response.body.engines.length).to.be.above(0);

      for (const engine of response.body.engines) {
        expect(engine).to.have.property('token');
        expect(engine).to.have.property('name');
        expect(engine).to.have.property('state');
        expect(engine).to.have.property('activityStatus');
        expect(engine).to.have.property('sequenceNumber');
        expect(engine).to.have.property('postponed');

        expect(engine, 'engine state').to.not.have.property('engine');
      }
    });
  });

  describe('GET (*splat)/status/:token', () => {
    it('returns engine status but not engine state', async () => {
      const { body } = await apps.request().post('/rest/process-definition/test-process/start').expect(201);

      const response = await apps.request().get(`/rest/status/${body.id}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('token', body.id);
      expect(response.body).to.have.property('state');
      expect(response.body).to.have.property('activityStatus');
      expect(response.body, 'engine state').to.not.have.property('engine');
    });

    it('status of a corrupt state returns 502', async () => {
      class VolatileAdapter extends MemoryAdapter {
        fetch(type, key, options) {
          if (type === STORAGE_TYPE_STATE) {
            return Promise.resolve(JSON.parse('{0'));
          } else {
            return super.fetch(type, key, options);
          }
        }
      }

      const app = getAppWithExtensions({ adapter: new VolatileAdapter() });

      const response = await request(app).get('/rest/status/token');

      expect(response.statusCode, response.text).to.equal(502);
    });
  });

  describe('GET (*splat)/status/:token/:activityId', () => {
    it('returns 404 if token was not found', () => {
      return apps.request().get('/rest/status/no-token/activity-id').expect(404);
    });

    it('returns 400 if no running activity was found', async () => {
      const response = await apps.request().post('/rest/process-definition/test-process/start').expect(201);

      return apps.request().get(`/rest/status/${response.body.id}/no-activity-id`).expect(400);
    });
  });

  describe('POST (*splat)/resume/:token', () => {
    it('resume a corrupt state returns 502', async () => {
      class VolatileAdapter extends MemoryAdapter {
        fetch(type, key, options) {
          if (type === STORAGE_TYPE_STATE) {
            return Promise.resolve('{0');
          } else {
            return super.fetch(type, key, options);
          }
        }
      }

      const app = getAppWithExtensions({ adapter: new VolatileAdapter() });

      const response = await request(app).post('/rest/resume/token').send({ id: 'task' });

      expect(response.statusCode, response.text).to.equal(502);
    });
  });

  describe('POST (*splat)/signal/:token', () => {
    it('signal a corrupt state returns 502', async () => {
      class VolatileAdapter extends MemoryAdapter {
        fetch(type, key, options) {
          if (type === STORAGE_TYPE_STATE) {
            return Promise.resolve('{0');
          } else {
            return super.fetch(type, key, options);
          }
        }
      }

      const app = getAppWithExtensions({ adapter: new VolatileAdapter() });

      const response = await request(app).post('/rest/signal/token').send({ id: 'task' });

      expect(response.statusCode, response.text).to.equal(502);
    });
  });

  describe('POST (*splat)/cancel/:token', () => {
    it('cancel a corrupt state returns 502', async () => {
      class VolatileAdapter extends MemoryAdapter {
        fetch(type, key, options) {
          if (type === STORAGE_TYPE_STATE) {
            return Promise.resolve('{0');
          } else {
            return super.fetch(type, key, options);
          }
        }
      }

      const app = getAppWithExtensions({ adapter: new VolatileAdapter() });

      const response = await request(app).post('/rest/cancel/token').send({ id: 'task' });

      expect(response.statusCode, response.text).to.equal(502);
    });
  });

  describe('POST (*splat)/fail/:token', () => {
    it('returns 404 if token was not found', () => {
      return apps.request().post('/rest/fail/no-token').send({}).expect(404);
    });
  });

  describe('GET (*splat)/state/:token', () => {
    it('returns 404 if token was not found', () => {
      return apps.request().get('/rest/state/no-token').expect(404);
    });
  });

  describe('DELETE (*)/state/:token', () => {
    let app;
    afterEach(() => {
      return app && request(app).delete('/rest/internal/stop');
    });

    it('fails if adapter delete fails', () => {
      class VolatileAdapter extends MemoryAdapter {
        delete(type, key) {
          if (type === STORAGE_TYPE_STATE) {
            return Promise.reject(new Error('DB delete error'));
          } else {
            return super.delete(type, key);
          }
        }
      }

      app = getAppWithExtensions({ adapter: new VolatileAdapter() });

      return request(app).delete('/rest/state/no-token').expect(502).expect({ message: 'DB delete error' });
    });
  });

  describe('DELETE (*splat)/internal/stop', () => {
    it('responds', () => {
      return request(apps.balance()).delete('/rest/internal/stop').expect(204);
    });
  });

  describe('DELETE (*splat)/internal/stop/:token', () => {
    it('responds', () => {
      return request(apps.balance()).delete('/rest/internal/stop/token').expect(204);
    });
  });

  describe('GET (*splat)/timers/:deploymentName', () => {
    it('returns not found if deployment is not found', () => {
      return apps.request().get('/rest/timers/not-deployed').expect(404);
    });

    it('returns empty if no timers', async () => {
      const name = 'no-timers';

      await createDeployment(
        apps.balance(),
        name,
        `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="called-deployment" isExecutable="true">
            <task id="task" />
          </process>
        </definitions>`
      );

      return apps
        .request()
        .get('/rest/timers/' + name)
        .expect(200)
        .expect({ timers: [] });
    });
  });
});

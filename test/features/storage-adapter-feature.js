import request from 'supertest';
import * as ck from 'chronokinesis';
import { LRUCache } from 'lru-cache';
import FormData from 'form-data';

import { createDeployment, waitForProcess, horizontallyScaled } from '../helpers/test-helpers.js';
import { MemoryAdapter, STORAGE_TYPE_STATE, STORAGE_TYPE_FILE, STORAGE_TYPE_DEPLOYMENT, DEFAULT_IDLE_TIMER } from '../../src/index.js';

class StorageAdapter {
  constructor({ storeSerialized } = {}) {
    this.storeSerialized = storeSerialized;
    this[STORAGE_TYPE_STATE] = new Map();
    this[STORAGE_TYPE_FILE] = new Map();
    this[STORAGE_TYPE_DEPLOYMENT] = new Map();
  }
  async upsert(type, key, value /* options */) {
    const data = typeof value === 'string' ? value : { ...(await this.fetch(type, key)), ...value };

    return new Promise((resolve) =>
      process.nextTick(() => {
        resolve(this[type].set(key, JSON.stringify(data)));
      })
    );
  }
  deleteByKey(/* type, key, options */) {
    throw new Error('not implemented');
  }
  fetch(type, key /*  options */) {
    return new Promise((resolve) =>
      process.nextTick(() => {
        const value = this[type].get(key);
        resolve(value && JSON.parse(value));
      })
    );
  }
  query(/* type, qs */) {
    throw new Error('not implemented');
  }
}

Feature('storage adapter', () => {
  after(ck.reset);

  Scenario('custom storage adapter', () => {
    let apps, adapter;
    after(() => {
      return apps.stop();
    });

    Given('two parallel app instances with a custom storage adapter', () => {
      adapter = new StorageAdapter();
      apps = horizontallyScaled(2, { adapter });
    });

    And('a process with a user task with a non-interrupting bound timeout', () => {
      return createDeployment(
        apps.balance(),
        'memory-adapter',
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <userTask id="task" />
            <boundaryEvent id="bound-timer" attachedToRef="task" cancelActivity="false">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT10S</timeDuration>
              </timerEventDefinition>
            </boundaryEvent>
          </process>
        </definitions>`
      );
    });

    let response, bp;
    When('process is started', async () => {
      response = await apps.request().post('/rest/process-definition/memory-adapter/start').expect(201);

      bp = response.body;
    });

    Then('process status is running timer', async () => {
      response = await apps.request().get(`/rest/status/${bp.id}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('state', 'running');
      expect(response.body).to.have.property('activityStatus', 'timer');
      expect(response.body).to.have.property('expireAt').that.is.ok;
    });

    Given('process run is stopped', () => {
      return apps.request().delete(`/rest/internal/stop/${bp.id}`).expect(204);
    });

    When('process status is fetched', async () => {
      response = await apps.request().get(`/rest/status/${bp.id}`);
    });

    Then('status is still running', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('state', 'running');
      expect(response.body).to.have.property('activityStatus', 'timer');
      expect(response.body).to.have.property('expireAt').that.is.ok;
    });

    let end;
    When('process user task is signaled', () => {
      const app = apps.balance();
      end = waitForProcess(app, bp.id).end();
      return request(app).post(`/rest/signal/${bp.id}`).send({ id: 'task' }).expect(200);
    });

    Then('run completes', () => {
      return end;
    });

    And('first app also has the completed process', async () => {
      response = await apps.request().get(`/rest/status/${bp.id}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('state', 'idle');
    });

    When('second app signals the completed process', async () => {
      response = await apps.request().post(`/rest/signal/${bp.id}`).send({ id: 'task' });
    });

    Then('bad request is returned with completed message', () => {
      expect(response.statusCode, response.text).to.equal(400);
      expect(response.body)
        .to.have.property('message')
        .that.match(/completed/i);
    });

    When('first app attempts to signal the completed process', async () => {
      response = await apps.request().post(`/rest/signal/${bp.id}`).send({ id: 'task' });
    });

    Then('bad request is returned with completed message', () => {
      expect(response.statusCode, response.text).to.equal(400);
      expect(response.body)
        .to.have.property('message')
        .that.match(/completed/i);
    });

    Given('the state is purged', () => {
      adapter[STORAGE_TYPE_STATE].delete(bp.id);
    });

    When('first app attempts to signal the completed process', async () => {
      response = await apps.request().post(`/rest/signal/${bp.id}`).send({ id: 'task' });
    });

    Then('not found is returned', () => {
      expect(response.statusCode, response.text).to.equal(404);
    });

    When('process is ran again', async () => {
      response = await apps.request().post('/rest/process-definition/memory-adapter/start').expect(201);

      bp = response.body;
    });
  });

  Scenario('really fast running process', () => {
    let apps, adapter;
    after(() => {
      return apps.stop();
    });

    Given('two parallel app instances with a custom storage adapter', () => {
      adapter = new StorageAdapter();
      apps = horizontallyScaled(2, { adapter });
    });

    And('a process with only a start event', () => {
      return createDeployment(
        apps.balance(),
        'fast-process',
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <startEvent id="start" />
          </process>
        </definitions>`
      );
    });

    let response, bp;
    When('process is started', async () => {
      response = await apps.request().post('/rest/process-definition/fast-process/start').expect(201);

      bp = response.body;
    });

    Then('process status is completed', async () => {
      response = await apps.request().get(`/rest/status/${bp.id}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('state', 'idle');
      expect(response.body).to.have.property('activityStatus', 'idle');
      expect(response.body).to.not.have.property('expireAt');
    });
  });

  Scenario('process is signalled from different app instances', () => {
    let apps, adapter;
    after(() => {
      return apps.stop();
    });

    Given('two parallel app instances with a custom storage adapter', () => {
      adapter = new StorageAdapter();
      apps = horizontallyScaled(2, { adapter });
    });

    And('a process with a user task with a non-interrupting bound timeout', () => {
      return createDeployment(
        apps.balance(),
        'multi-user-task',
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <startEvent id="start" />
            <sequenceFlow id="to-task1" sourceRef="start" targetRef="task1" />
            <userTask id="task1" />
            <sequenceFlow id="to-task2" sourceRef="task1" targetRef="task2" />
            <userTask id="task2" />
            <sequenceFlow id="to-end" sourceRef="task2" targetRef="end" />
            <endEvent id="end" />
          </process>
        </definitions>`
      );
    });

    let response, bp;
    When('process is started', async () => {
      response = await apps.request().post('/rest/process-definition/multi-user-task/start').expect(201);

      bp = response.body;
    });

    Then('process status is running', async () => {
      response = await apps.request().get(`/rest/status/${bp.id}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('state', 'running');
      expect(response.body).to.have.property('activityStatus', 'wait');
      expect(response.body.expireAt).to.not.be.ok;
    });

    When('process resumed so it is running on both apps', async () => {
      response = await apps.request().post(`/rest/resume/${bp.id}`).expect(200);

      response = await apps.request().post(`/rest/resume/${bp.id}`).expect(200);
    });

    Then('both processes have the same sequence number', () => {
      const [engine1, engine2] = apps.getRunningByToken(bp.id);
      expect(engine1.options.sequenceNumber).to.equal(engine2.options.sequenceNumber);
    });

    When('first user task is signalled', async () => {
      response = await apps.request().post(`/rest/signal/${bp.id}`).send({ id: 'task1' }).expect(200);
    });

    Then('process sequence numbers has diverged', () => {
      const [engine1, engine2] = apps.getRunningByToken(bp.id);
      expect(engine1.options.sequenceNumber).to.not.equal(engine2.options.sequenceNumber);
    });

    When('first user task is signalled again from the other app instance', async () => {
      response = await apps.request().post(`/rest/signal/${bp.id}`).send({ id: 'task1' });
    });

    Then('ok is returned', () => {
      expect(response.statusCode, response.text).to.equal(200);
    });

    And('process instance is still running on both apps', () => {
      expect(apps.getRunningByToken(bp.id)).to.have.length(2);
    });

    let sequenceNumber;
    When('process idle timer times out', () => {
      ck.travel(Date.now() + DEFAULT_IDLE_TIMER);
      const running = apps.getRunningByToken(bp.id);
      expect(running).to.have.length(2);

      sequenceNumber = running[0].options.sequenceNumber;
      running[0].idleTimer.callback();
      running[1].idleTimer.callback();
    });

    Then('process execution is stopped', () => {
      expect(apps.getRunningByToken(bp.id)).to.have.length(0);
    });

    And('status is running', async () => {
      response = await apps.request().get(`/rest/status/${bp.id}`);

      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('state', 'running');
      expect(response.body).to.have.property('activityStatus', 'wait');
      expect(response.body).to.have.property('sequenceNumber', sequenceNumber);
      expect(response.body.expireAt).to.not.be.ok;
    });

    When('process resumed so it is running on both apps', async () => {
      response = await apps.request().post(`/rest/resume/${bp.id}`).expect(200);

      response = await apps.request().post(`/rest/resume/${bp.id}`).expect(200);
    });

    Then('both processes are resumed with the same sequence number', () => {
      const [engine1, engine2] = apps.getRunningByToken(bp.id);
      expect(engine1.options.sequenceNumber, 'resumed sequence number').to.equal(sequenceNumber);
      expect(engine1.options.sequenceNumber).to.equal(engine2.options.sequenceNumber);
    });
  });

  Scenario('storage adapter throws on create deployment', () => {
    let apps, storage;
    after(() => {
      return apps.stop();
    });

    Given('a faulty storage adapter', () => {
      storage = new LRUCache({ max: 1000 });
      class VolatileAdapter extends MemoryAdapter {
        upsert(type, key, value) {
          if (type === STORAGE_TYPE_DEPLOYMENT) {
            return Promise.reject(new Error('DB error'));
          } else {
            return super.upsert(type, key, value);
          }
        }
      }

      apps = horizontallyScaled(2, { adapter: new VolatileAdapter(storage) });
    });

    let response;
    And('a process is deployed', async () => {
      response = await createDeployment(
        apps.balance(),
        'faulty-adapter',
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <userTask id="task" />
          </process>
        </definitions>`
      );
    });

    Then('error is returned', () => {
      expect(response.statusCode, response.text).to.equal(502);
      expect(response.body.message).to.equal('DB error');
    });
  });

  Scenario('storage adapter throws on upsert state', () => {
    let apps, storage;
    after(() => {
      return apps.stop();
    });

    Given('a faulty storage adapter', () => {
      storage = new LRUCache({ max: 1000 });
      class VolatileAdapter extends MemoryAdapter {
        upsert(type, key, value) {
          if (type === STORAGE_TYPE_STATE && value.sequenceNumber > 12) {
            return Promise.reject(new Error('DB error'));
          } else {
            return super.upsert(type, key, value);
          }
        }
      }

      apps = horizontallyScaled(2, { adapter: new VolatileAdapter(storage) });
    });

    And('a process with a user task with bound timers', () => {
      return createDeployment(
        apps.balance(),
        'faulty-adapter',
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <userTask id="task" />
            <boundaryEvent id="timer20" attachedToRef="task">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT20S</timeDuration>
              </timerEventDefinition>
            </boundaryEvent>
            <boundaryEvent id="timer30" attachedToRef="task">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT30S</timeDuration>
              </timerEventDefinition>
            </boundaryEvent>
            <boundaryEvent id="timer10" attachedToRef="task">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT10S</timeDuration>
              </timerEventDefinition>
            </boundaryEvent>
          </process>
        </definitions>`
      );
    });

    let app, response, errored;
    When('process is started', async () => {
      app = apps.balance();
      errored = new Promise((resolve) => app.once('bpmn/error', resolve));
      response = await request(app).post('/rest/process-definition/faulty-adapter/start').expect(201);

      expect(response.body.id).to.be.ok;
    });

    Then('an error is emitted', async () => {
      const err = await errored;
      expect(err).to.match(/DB Error/i);
    });

    And('engine is not running', () => {
      expect(apps.getRunning()).to.have.length(0);
    });
  });

  Scenario('storage adapter throws on query state and status', () => {
    let apps, storage;
    after(() => {
      return apps.stop();
    });

    Given('a faulty storage adapter', () => {
      storage = new LRUCache({ max: 1000 });
      class VolatileAdapter extends MemoryAdapter {
        fetch(type, key, options) {
          if (type === STORAGE_TYPE_STATE) {
            return Promise.reject(new Error('DB fetch error'));
          } else {
            return super.fetch(type, key, options);
          }
        }
        query(type, qs, options) {
          if (type === STORAGE_TYPE_STATE) {
            return Promise.reject(new Error('DB query error'));
          } else {
            return super.query(type, qs, options);
          }
        }
      }

      apps = horizontallyScaled(2, { adapter: new VolatileAdapter(storage) });
    });

    And('a process with a user task with bound timers', () => {
      return createDeployment(
        apps.balance(),
        'faulty-adapter',
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <userTask id="task" />
            <boundaryEvent id="timer20" attachedToRef="task">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT20S</timeDuration>
              </timerEventDefinition>
            </boundaryEvent>
            <boundaryEvent id="timer30" attachedToRef="task">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT30S</timeDuration>
              </timerEventDefinition>
            </boundaryEvent>
            <boundaryEvent id="timer10" attachedToRef="task">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT10S</timeDuration>
              </timerEventDefinition>
            </boundaryEvent>
          </process>
        </definitions>`
      );
    });

    let app, response, token;
    And('process is started', async () => {
      app = apps.balance();
      response = await request(app).post('/rest/process-definition/faulty-adapter/start').expect(201);

      expect(response.body.id).to.be.ok;
      token = response.body.id;
    });

    When('running processes are fetched', async () => {
      response = await request(app).get('/rest/running');
    });

    Then('error response', () => {
      expect(response.statusCode, response.text).to.equal(502);
      expect(response.body.message).to.equal('DB query error');
    });

    When('process status is fetched', async () => {
      response = await request(app).get(`/rest/status/${token}`);
    });

    Then('error response', () => {
      expect(response.statusCode, response.text).to.equal(502);
      expect(response.body.message).to.equal('DB fetch error');
    });

    And('engine is still running', () => {
      expect(apps.getRunning()).to.have.length(1);
    });
  });

  Scenario('storage adapter throws on upsert file', () => {
    let apps, storage;
    after(() => {
      return apps.stop();
    });

    Given('a faulty storage adapter', () => {
      storage = new LRUCache({ max: 1000 });
      class VolatileAdapter extends MemoryAdapter {
        upsert(type, key, value) {
          if (type === STORAGE_TYPE_FILE) {
            return Promise.reject(new Error('DB file error'));
          } else {
            return super.upsert(type, key, value);
          }
        }
      }

      apps = horizontallyScaled(2, { adapter: new VolatileAdapter(storage) });
    });

    let response;
    And('a process is deployed', async () => {
      response = await createDeployment(
        apps.balance(),
        'faulty-adapter',
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <userTask id="task" />
          </process>
        </definitions>`
      );
    });

    Then('error is returned', () => {
      expect(response.statusCode, response.text).to.equal(502);
      expect(response.body.message).to.equal('DB file error');
    });
  });

  Scenario('storage adapter throws on upsert multiple files', () => {
    let apps, adapter;
    after(() => {
      return apps.stop();
    });

    Given('a faulty storage adapter', () => {
      class VolatileAdapter extends MemoryAdapter {
        upsert(type, key, value) {
          if (type === STORAGE_TYPE_FILE && key === 'multiple-file-process.json') {
            return Promise.reject(new Error('DB json file error'));
          } else {
            return super.upsert(type, key, value);
          }
        }
      }

      adapter = new VolatileAdapter();
      apps = horizontallyScaled(2, { adapter });
    });

    let deploymentName, response;
    And('a process is with multiple files', async () => {
      deploymentName = 'multiple-file-process';
      const form = new FormData();
      form.append('deployment-name', deploymentName);
      form.append('deployment-source', 'Test modeler');
      form.append(
        `${deploymentName}.bpmn`,
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <userTask id="task" />
          </process>
        </definitions>`,
        `${deploymentName}.bpmn`
      );

      form.append(`${deploymentName}.json`, Buffer.from('{"foo":"bar"}'), `${deploymentName}.json`);

      response = await apps.request().post('/rest/deployment/create').set(form.getHeaders()).send(form.getBuffer().toString());
    });

    Then('error is returned', () => {
      expect(response.statusCode, response.text).to.equal(502);
      expect(response.body.message).to.equal('DB json file error');
    });

    And('storage lack both files', async () => {
      expect(await adapter.fetch(STORAGE_TYPE_FILE, `${deploymentName}.json`), `${deploymentName}.json`).to.not.be.ok;
      expect(await adapter.fetch(STORAGE_TYPE_FILE, `${deploymentName}.bpmn`), `${deploymentName}.bpmn`).to.not.be.ok;
    });
  });

  Scenario('storage adapter throws on delete file', () => {
    let apps, adapter;
    after(() => {
      return apps.stop();
    });

    Given('a faulty storage adapter', () => {
      class VolatileAdapter extends MemoryAdapter {
        upsert(type, key, value) {
          if (type === STORAGE_TYPE_FILE && key === 'multiple-file-process.json') {
            return Promise.reject(new Error('DB json file error'));
          } else {
            return super.upsert(type, key, value);
          }
        }
        delete(type, key, value) {
          if (type === STORAGE_TYPE_FILE && key === 'multiple-file-process.bpmn') {
            return Promise.reject(new Error('Delete DB bpmn file error'));
          } else {
            return super.delete(type, key, value);
          }
        }
      }

      adapter = new VolatileAdapter();
      apps = horizontallyScaled(2, { adapter });
    });

    let deploymentName, response;
    And('a process is with multiple files', async () => {
      deploymentName = 'multiple-file-process';
      const form = new FormData();
      form.append('deployment-name', deploymentName);
      form.append('deployment-source', 'Test modeler');
      form.append(
        `${deploymentName}.bpmn`,
        `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <userTask id="task" />
          </process>
        </definitions>`,
        `${deploymentName}.bpmn`
      );

      form.append(`${deploymentName}.json`, Buffer.from('{"foo":"bar"}'), `${deploymentName}.json`);

      response = await apps.request().post('/rest/deployment/create').set(form.getHeaders()).send(form.getBuffer().toString());
    });

    Then('error is returned', () => {
      expect(response.statusCode, response.text).to.equal(502);
      expect(response.body.message).to.equal('DB json file error');
    });

    And('storage has kept file', async () => {
      expect(await adapter.fetch(STORAGE_TYPE_FILE, `${deploymentName}.json`), `${deploymentName}.json`).to.not.be.ok;
      expect(await adapter.fetch(STORAGE_TYPE_FILE, `${deploymentName}.bpmn`), `${deploymentName}.bpmn`).to.be.ok;
    });
  });
});

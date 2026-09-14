import amqplib from 'amqplib';
import request from 'supertest';
import { LRUCache } from 'lru-cache';
import { AmqpServer } from 'amqp-emulator';
import { MemoryAdapter } from 'bpmn-middleware';

import { createDeploymentForm, getExampleResource } from '../helpers/test-helpers.js';
import { createApp } from '../../example/amqp/app.js';
import { startWorker } from '../../example/amqp/worker.js';
import { ReadModel } from '../../example/amqp/read-model.js';
import { encode, COMMANDS_QUEUE } from '../../example/amqp/topology.js';

Feature('amqp example app', () => {
  /** @type {AmqpServer} */
  let server;
  /** @type {string} */
  let url;
  /** @type {import('express').Express} */
  let app;
  /** @type {import('../../example/amqp/worker.js').Worker[]} */
  let workers;
  before('amqp emulator, api and two workers are started', async () => {
    server = new AmqpServer();
    ({ url } = await server.listen());

    /** @type {LRUCache<string, any, any>}  */
    const storage = new LRUCache({ max: 1000 });

    app = await createApp({ url, adapter: new MemoryAdapter(storage) });
    workers = await Promise.all([
      startWorker({ url, name: 'worker-1', adapter: new MemoryAdapter(storage) }),
      startWorker({ url, name: 'worker-2', adapter: new MemoryAdapter(storage) }),
    ]);
  });
  after(async () => {
    await Promise.all(workers.map((worker) => worker.close()));
    await app.locals.close();
    await server.close();
  });

  Scenario('order with user task and call activity runs in workers', () => {
    Given('order and fulfilment processes are deployed through the api', async () => {
      await deploy('amqp-order', getExampleResource('amqp-order.bpmn'));
      await deploy('amqp-fulfilment', getExampleResource('amqp-fulfilment.bpmn'));
    });

    let token;
    When('order is started', async () => {
      const { body } = await request(app).post('/start/amqp-order').send({ orderId: 42 }).expect(201);
      token = body.id;
      expect(token).to.be.a('string');
    });

    Then('read model reports order waiting for approval', async () => {
      const status = await app.locals.readModel.waitFor(token, (s) => s.state === 'waiting');
      expect(status.deployment).to.equal('amqp-order');
      expect(status.waiting).to.deep.equal(['approve']);
    });

    And('no worker keeps the waiting engine in memory', () => {
      for (const worker of workers) {
        expect(worker.engines.running, worker.name).to.have.length(0);
      }
    });

    When('order is approved', async () => {
      await request(app)
        .post(`/signal/${token}`)
        .send({ id: 'approve', message: { approved: true } })
        .expect(202);
    });

    Then('fulfilment is started by the call activity with order as caller', async () => {
      const [fulfilment] = await app.locals.readModel.waitForMany(
        (statuses) => statuses.filter((s) => s.deployment === 'amqp-fulfilment' && s.state === 'completed'),
        1
      );
      expect(fulfilment.caller).to.have.property('token', token);
      expect(fulfilment.caller).to.have.property('id', 'fulfil');
      expect(fulfilment.output).to.deep.equal({ shipped: true });
    });

    And('order completes', async () => {
      const status = await app.locals.readModel.waitFor(token, (s) => s.state === 'completed');
      expect(status.waiting).to.deep.equal([]);
    });

    And('status is served by the api', async () => {
      const { body } = await request(app).get(`/status/${token}`).expect(200);
      expect(body).to.have.property('state', 'completed');
      expect(body).to.have.property('worker').that.is.a('string');
    });

    And('all statuses are listed by the api', async () => {
      const { body } = await request(app).get('/status').expect(200);
      expect(body.map((s) => s.token)).to.include(token);
    });
  });

  Scenario('call activity addressing a missing deployment', () => {
    Given('an order calling a deployment that does not exist', () => {
      return deploy('amqp-order-missing', callActivityDiagram('deployment:amqp-missing'));
    });

    let token;
    When('order is started', async () => {
      const { body } = await request(app).post('/start/amqp-order-missing').expect(201);
      token = body.id;
    });

    Then('read model reports the order failed with the missing deployment', async () => {
      const status = await app.locals.readModel.waitFor(token, (s) => s.state === 'error');
      expect(status.error)
        .to.have.property('message')
        .that.match(/amqp-missing does not exist/);
    });
  });

  Scenario('called process fails', () => {
    Given('a fulfilment that throws and an order calling it', async () => {
      await deploy(
        'amqp-ship-error',
        `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
          <process id="amqp-ship-error" isExecutable="true">
            <startEvent id="start" />
            <sequenceFlow id="to-ship" sourceRef="start" targetRef="ship" />
            <scriptTask id="ship" scriptFormat="javascript">
              <script>next(new Error('out of stock'));</script>
            </scriptTask>
          </process>
        </definitions>`
      );
      await deploy('amqp-order-error', callActivityDiagram('deployment:amqp-ship-error'));
    });

    let token;
    When('order is started', async () => {
      const { body } = await request(app).post('/start/amqp-order-error').expect(201);
      token = body.id;
    });

    Then('read model reports the order failed with the called process error', async () => {
      const status = await app.locals.readModel.waitFor(token, (s) => s.state === 'error');
      expect(status.error)
        .to.have.property('message')
        .that.match(/out of stock/);
    });
  });

  Scenario('call activity addressing a process in the same diagram', () => {
    Given('an order calling a process in its own diagram', () => {
      return deploy(
        'amqp-order-internal',
        `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
          <process id="order" isExecutable="true">
            <startEvent id="start" />
            <sequenceFlow id="to-fulfil" sourceRef="start" targetRef="fulfil" />
            <callActivity id="fulfil" calledElement="fulfilment" />
            <sequenceFlow id="to-end" sourceRef="fulfil" targetRef="end" />
            <endEvent id="end" />
          </process>
          <process id="fulfilment" isExecutable="false">
            <task id="ship" />
          </process>
        </definitions>`
      );
    });

    let token;
    When('order is started', async () => {
      const { body } = await request(app).post('/start/amqp-order-internal').expect(201);
      token = body.id;
    });

    Then('the workers leave the call to the engine and the order completes', async () => {
      const status = await app.locals.readModel.waitFor(token, (s) => s.state === 'completed');
      expect(status.waiting).to.deep.equal([]);
    });
  });

  Scenario('calling process is gone when the called process completes', () => {
    Given('a fulfilment with a user task and an order calling it', async () => {
      await deploy(
        'amqp-pack',
        `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
          <process id="amqp-pack" isExecutable="true">
            <startEvent id="start" />
            <sequenceFlow id="to-pack" sourceRef="start" targetRef="pack" />
            <userTask id="pack" />
          </process>
        </definitions>`
      );
      await deploy('amqp-order-pack', callActivityDiagram('deployment:amqp-pack'));
    });

    let token, packToken;
    When('order is started and the fulfilment waits to be packed', async () => {
      const { body } = await request(app).post('/start/amqp-order-pack').expect(201);
      token = body.id;

      const [pack] = await app.locals.readModel.waitForMany((statuses) =>
        statuses.filter((s) => s.deployment === 'amqp-pack' && s.state === 'waiting')
      );
      packToken = pack.token;
    });

    And('the order state is deleted', () => {
      return request(app).delete(`/rest/state/${token}`).expect(204);
    });

    And('the fulfilment is packed', async () => {
      await request(app).post(`/signal/${packToken}`).send({ id: 'pack' }).expect(202);
    });

    Then('read model reports the fulfilment failed to address the order', async () => {
      const status = await app.locals.readModel.waitFor(packToken, (s) => s.state === 'error');
      expect(status.error)
        .to.have.property('message')
        .that.match(/not found/);
    });
  });

  Scenario('unknown command', () => {
    let connection;
    before(async () => {
      connection = await amqplib.connect(url);
    });
    after(() => connection.close());

    When('a command of unknown type is queued', async () => {
      const channel = await connection.createChannel();
      channel.sendToQueue(COMMANDS_QUEUE, encode({ type: 'nope', token: 'bogus' }));
    });

    Then('read model reports the failed command', async () => {
      const status = await app.locals.readModel.waitFor('bogus', (s) => s.state === 'error');
      expect(status.error).to.have.property('message', 'unknown command type nope');
    });
  });

  Scenario('read model awaits events', () => {
    const readModel = new ReadModel();

    let pending;
    Given('a status is awaited before any event has arrived', () => {
      pending = readModel.waitFor('t1', (s) => s.state === 'completed');
    });

    When('events for another token and the awaited token arrive', () => {
      readModel.apply('engine.end', {}, { token: 't2', worker: 'w2' });
      readModel.apply('activity.wait', { id: 'task' }, { token: 't1', deployment: 'd', worker: 'w1' });
      readModel.apply('engine.end', {}, { token: 't1' });
    });

    Then('the awaited status resolves keeping deployment and worker from earlier events', async () => {
      const status = await pending;
      expect(status).to.include({ token: 't1', state: 'completed', deployment: 'd', worker: 'w1' });
    });

    let pendingMany;
    Given('two completed statuses are awaited', () => {
      pendingMany = readModel.waitForMany((statuses) => statuses.filter((s) => s.state === 'completed'), 3);
    });

    When('a third engine waits and then completes', () => {
      readModel.apply('activity.wait', { id: 'task' }, { token: 't3', worker: 'w1' });
      readModel.apply('engine.end', {}, { token: 't3', worker: 'w1' });
    });

    Then('the awaited statuses resolve', async () => {
      const statuses = await pendingMany;
      expect(statuses.map((s) => s.token)).to.deep.equal(['t2', 't1', 't3']);
    });

    And('statuses that are already there resolve right away', async () => {
      expect(await readModel.waitFor('t1', (s) => s.state === 'completed')).to.have.property('token', 't1');
      expect(await readModel.waitForMany((statuses) => statuses.filter((s) => s.state === 'completed'), 3)).to.have.length(3);
    });
  });

  Scenario('signal with unknown token', () => {
    let response;
    When('an unknown token is signalled', async () => {
      response = await request(app).post('/signal/unknown').send({ id: 'approve' }).expect(202);
      expect(response.body).to.have.property('id', 'unknown');
    });

    Then('read model reports the failed command', async () => {
      const status = await app.locals.readModel.waitFor('unknown', (s) => s.state === 'error');
      expect(status.error)
        .to.have.property('message')
        .that.match(/not found/);
    });
  });

  Scenario('unknown deployment and status', () => {
    Then('starting an unknown deployment is rejected', () => {
      return request(app).post('/start/nope').expect(404);
    });

    And('status of an unknown token is not found', () => {
      return request(app).get('/status/nope').expect(404);
    });
  });

  /**
   * @param {string} calledElement
   */
  function callActivityDiagram(calledElement) {
    return `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <process id="order" isExecutable="true">
        <startEvent id="start" />
        <sequenceFlow id="to-fulfil" sourceRef="start" targetRef="fulfil" />
        <callActivity id="fulfil" calledElement="${calledElement}" />
        <sequenceFlow id="to-end" sourceRef="fulfil" targetRef="end" />
        <endEvent id="end" />
      </process>
    </definitions>`;
  }

  /**
   * @param {string} name
   * @param {Buffer | string} source
   */
  async function deploy(name, source) {
    const form = await createDeploymentForm(name, source);
    await request(app).post('/rest/deployment/create').set(form.getHeaders()).send(form.getBuffer().toString()).expect(201);
  }
});

import request from 'supertest';
import * as ck from 'chronokinesis';

import { createDeployment, waitForProcess, horizontallyScaled } from '../helpers/testHelpers.js';
import { MemoryAdapter } from '../../src/index.js';

Feature('signal activity', () => {
  after(ck.reset);

  Scenario('process with signal event definition', () => {
    let apps, adapter;
    before(() => {
      adapter = new MemoryAdapter();
      apps = horizontallyScaled(2, { adapter });
    });
    after(() => apps.stop());

    Given('a process with two signal event definitions with same signal reference', () => {
      return createDeployment(apps.balance(), 'signal-process', `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="main-process" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-signal1" sourceRef="start" targetRef="signal1" />
          <sequenceFlow id="to-signal2" sourceRef="start" targetRef="signal2" />
          <intermediateCatchEvent id="signal1">
            <signalEventDefinition signalRef="Signal_0" />
          </intermediateCatchEvent>
          <intermediateCatchEvent id="signal2">
            <signalEventDefinition signalRef="Signal_0" />
          </intermediateCatchEvent>
          <sequenceFlow id="from-signal1" sourceRef="signal1" targetRef="end" />
          <sequenceFlow id="from-signal2" sourceRef="signal2" targetRef="end" />
          <endEvent id="end" />
        </process>
        <signal id="Signal_0" name="One and only signal" />
      </definitions>`);
    });

    let token, wait;
    When('when process is started', async () => {
      const app = apps.balance();
      wait = waitForProcess(app, 'signal-process').wait();

      const response = await request(app)
        .post('/rest/process-definition/signal-process/start')
        .expect(201);

      token = response.body.id;
    });

    Then('run is waiting for signal', () => {
      return wait;
    });

    When('process is signalled with signal id', () => {
      const app = apps.balance();
      wait = waitForProcess(app, 'signal-process').wait();

      return request(app)
        .post(`/rest/signal/${token}`)
        .send({ id: 'Signal_0' })
        .expect(200);
    });

    Then('run still waits for next signal', () => {
      return wait;
    });

    let end;
    When('process is signalled again with signal id', () => {
      const app = apps.balance();
      end = waitForProcess(app, 'signal-process').end();

      return request(app)
        .post(`/rest/signal/${token}`)
        .send({ id: 'Signal_0' })
        .expect(200);
    });

    Then('run completes', () => {
      return end;
    });
  });

  Scenario('process with message event definition', () => {
    let apps, adapter;
    before(() => {
      adapter = new MemoryAdapter();
      apps = horizontallyScaled(2, { adapter });
    });
    after(() => apps.stop());

    Given('a process with two message event definitions', () => {
      return createDeployment(apps.balance(), 'message-process', `<definitions id="Def_1" xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="main-process" isExecutable="true">
          <startEvent id="start" />
          <sequenceFlow id="to-message1" sourceRef="start" targetRef="message1" />
          <sequenceFlow id="to-message2" sourceRef="start" targetRef="message2" />
          <intermediateCatchEvent id="message1">
            <messageEventDefinition messageRef="Message_0" />
          </intermediateCatchEvent>
          <intermediateCatchEvent id="message2">
            <messageEventDefinition messageRef="Message_1" />
          </intermediateCatchEvent>
          <sequenceFlow id="from-message1" sourceRef="message1" targetRef="end" />
          <sequenceFlow id="from-message2" sourceRef="message2" targetRef="end" />
          <endEvent id="end" />
        </process>
        <message id="Message_0" name="First message" />
        <message id="Message_1" name="Second message" />
      </definitions>`);
    });

    let token, wait;
    When('when process is started', async () => {
      const app = apps.balance();
      wait = waitForProcess(app, 'message-process').wait();

      const response = await request(app)
        .post('/rest/process-definition/message-process/start')
        .expect(201);

      token = response.body.id;
    });

    Then('run is waiting for message', () => {
      return wait;
    });

    When('process is signalled with one message id', () => {
      const app = apps.balance();
      wait = waitForProcess(app, 'message-process').wait();

      return request(app)
        .post(`/rest/signal/${token}`)
        .send({ id: 'Message_1' })
        .expect(200);
    });

    Then('run still waits', () => {
      return wait;
    });

    let end;
    When('process is signalled with one message id', () => {
      const app = apps.balance();
      end = waitForProcess(app, 'message-process').end();

      return request(app)
        .post(`/rest/signal/${token}`)
        .send({ id: 'Message_0' })
        .expect(200);
    });

    Then('run completes', () => {
      return end;
    });
  });
});

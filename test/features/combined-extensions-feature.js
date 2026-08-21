import request from 'supertest';

import * as bpmnElements from 'bpmn-elements';
import {
  extensions as onifyExtensions,
  extendFn as onifyExtendFn,
  OnifySequenceFlow,
  OnifyTimerEventDefinition,
} from '@onify/flow-extensions';
import { extensions as zerodepExtensions, extendFn as zerodepExtendFn } from '@0dep/bpmn-extensions';
import camunda from 'camunda-bpmn-moddle/resources/camunda.json' with { type: 'json' };
import zeebe from 'zeebe-bpmn-moddle/resources/zeebe.json' with { type: 'json' };

import { createDeployment, waitForProcess, horizontallyScaled } from '../helpers/test-helpers.js';

const elements = {
  ...bpmnElements,
  SequenceFlow: OnifySequenceFlow,
  TimerEventDefinition: OnifyTimerEventDefinition,
};

/**
 * camunda-bpmn-moddle and zeebe-bpmn-moddle both extend the same bpmn base types with
 * modeler metadata properties. moddle refuses the double definition and the entire
 * process element becomes unparsable. Strip the colliding properties, they carry no
 * runtime behaviour.
 * @param {any} schema zeebe-bpmn-moddle schema
 */
function stripCollidingModdleProperties(schema) {
  const collidingProperties = ['modelerTemplate', 'modelerTemplateVersion', 'versionTag'];
  const patched = JSON.parse(JSON.stringify(schema));
  for (const type of patched.types) {
    if (!type.extends?.some((extended) => extended.startsWith('bpmn:'))) continue;
    type.properties = (type.properties || []).filter((p) => !collidingProperties.includes(p.name));
  }
  return patched;
}

/**
 * Both packages export an extend function for moddle-context-serializer, but the engine
 * takes only one. Compose them.
 * @param {any} behaviour
 * @param {any} element
 */
function combinedExtendFn(behaviour, element) {
  onifyExtendFn(behaviour, element);
  zerodepExtendFn(behaviour);
}

/**
 * Engine options combining onify flow-extensions and 0dep bpmn-extensions
 * @param {'onify-first' | 'zerodep-first'} [order] extension activation order
 * @returns {import('../../types/interfaces.js').MiddlewareEngineOptions}
 */
function getCombinedEngineOptions(order = 'onify-first') {
  return {
    moddleOptions: { camunda, zeebe: stripCollidingModdleProperties(zeebe) },
    elements,
    extensions:
      order === 'onify-first'
        ? { onify: onifyExtensions, zerodep: zerodepExtensions }
        : { zerodep: zerodepExtensions, onify: onifyExtensions },
    extendFn: combinedExtendFn,
    services: {
      serve(...args) {
        const next = args.pop();
        next(null, 'served');
      },
    },
  };
}

const camunda7Source = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  targetNamespace="http://bpmn.io/schema/bpmn" id="Def_c7">
  <process id="c7-process" isExecutable="true">
    <startEvent id="start" />
    <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
    <serviceTask id="task" camunda:expression="\${environment.services.serve}" camunda:resultVariable="serviceResult">
      <extensionElements>
        <camunda:inputOutput>
          <camunda:inputParameter name="in1">\${environment.variables.foo}</camunda:inputParameter>
          <camunda:outputParameter name="out1">\${content.output}</camunda:outputParameter>
        </camunda:inputOutput>
        <camunda:properties>
          <camunda:property name="p1" value="v1" />
        </camunda:properties>
      </extensionElements>
    </serviceTask>
    <sequenceFlow id="to-end" sourceRef="task" targetRef="end" />
    <endEvent id="end" />
  </process>
</definitions>`;

const camunda7WaitSource = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  targetNamespace="http://bpmn.io/schema/bpmn" id="Def_c7_wait">
  <process id="c7-wait-process" isExecutable="true">
    <startEvent id="start" />
    <sequenceFlow id="to-task" sourceRef="start" targetRef="task" />
    <userTask id="task">
      <extensionElements>
        <camunda:inputOutput>
          <camunda:outputParameter name="approved">\${environment.variables.foo}</camunda:outputParameter>
        </camunda:inputOutput>
      </extensionElements>
    </userTask>
    <sequenceFlow id="to-end" sourceRef="task" targetRef="end" />
    <endEvent id="end" />
  </process>
</definitions>`;

const mixedSource = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
  targetNamespace="http://bpmn.io/schema/bpmn" id="Def_mixed">
  <process id="mixed-process" isExecutable="true">
    <startEvent id="start" />
    <sequenceFlow id="to-task1" sourceRef="start" targetRef="task1" />
    <task id="task1">
      <extensionElements>
        <zeebe:ioMapping>
          <zeebe:output source="=foo" target="zeebeOut" />
        </zeebe:ioMapping>
      </extensionElements>
    </task>
    <sequenceFlow id="to-task2" sourceRef="task1" targetRef="task2" />
    <task id="task2">
      <extensionElements>
        <camunda:inputOutput>
          <camunda:outputParameter name="camundaOut">\${environment.variables.foo}</camunda:outputParameter>
        </camunda:inputOutput>
      </extensionElements>
    </task>
    <sequenceFlow id="to-end" sourceRef="task2" targetRef="end" />
    <endEvent id="end" />
  </process>
</definitions>`;

Feature('combined @onify/flow-extensions and @0dep/bpmn-extensions', () => {
  Scenario('Camunda 7 diagram with both extension packages', () => {
    /** @type {ReturnType<horizontallyScaled>} */
    let apps;
    before(() => {
      apps = horizontallyScaled(2, { engineOptions: getCombinedEngineOptions() });
    });
    after(() => apps.stop());

    Given('a Camunda 7 diagram with io, properties, and service expression is deployed', () => {
      return createDeployment(apps.balance(), 'c7-combined', camunda7Source);
    });

    let response;
    When('process is started in sync', async () => {
      response = await request(apps.balance())
        .post('/rest/process-definition/c7-combined/start')
        .query({ sync: true })
        .send({
          variables: { foo: 'bar' },
        });
    });

    Then('run completes with camunda io output', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('result').that.deep.equal({ out1: 'served' });
    });

    Given('a Camunda 7 diagram with a waiting user task is deployed', () => {
      return createDeployment(apps.balance(), 'c7-combined-wait', camunda7WaitSource);
    });

    let token, wait;
    When('process is started', async () => {
      const app = apps.balance();
      wait = waitForProcess(app, 'c7-combined-wait').wait();

      const startResponse = await request(app)
        .post('/rest/process-definition/c7-combined-wait/start')
        .send({ variables: { foo: 'bar' } })
        .expect(201);
      token = startResponse.body.id;
    });

    Then('run is waiting for user task', () => {
      return wait;
    });

    let end;
    When('user task is signaled via another app instance', () => {
      const app = apps.balance();
      end = waitForProcess(app, token).end();

      return request(app).post(`/rest/signal/${token}`).send({ id: 'task' }).expect(200);
    });

    Then('run completes on the other instance', () => {
      return end;
    });
  });

  Scenario('extension activation order is reversed', () => {
    /** @type {ReturnType<horizontallyScaled>} */
    let apps;
    before(() => {
      apps = horizontallyScaled(2, { engineOptions: getCombinedEngineOptions('zerodep-first') });
    });
    after(() => apps.stop());

    Given('the same Camunda 7 diagram is deployed', () => {
      return createDeployment(apps.balance(), 'c7-reversed', camunda7Source);
    });

    let response;
    When('process is started in sync', async () => {
      response = await request(apps.balance())
        .post('/rest/process-definition/c7-reversed/start')
        .query({ sync: true })
        .send({
          variables: { foo: 'bar' },
        });
    });

    Then('run completes with the same output', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('result').that.deep.equal({ out1: 'served' });
    });
  });

  Scenario('mixed Camunda 7 and 8 diagram (edge case)', () => {
    /** @type {ReturnType<horizontallyScaled>} */
    let apps;
    before(() => {
      apps = horizontallyScaled(2, { engineOptions: getCombinedEngineOptions() });
    });
    after(() => apps.stop());

    Given('a diagram with one zeebe io task and one camunda io task is deployed', () => {
      return createDeployment(apps.balance(), 'mixed-combined', mixedSource);
    });

    let response;
    When('process is started in sync', async () => {
      response = await request(apps.balance())
        .post('/rest/process-definition/mixed-combined/start')
        .query({ sync: true })
        .send({
          variables: { foo: 'bar' },
        });
    });

    Then('both extension packages have contributed output', () => {
      expect(response.statusCode, response.text).to.equal(200);
      expect(response.body).to.have.property('result').that.deep.equal({ zeebeOut: 'bar', camundaOut: 'bar' });
    });
  });

  Scenario('camunda and zeebe moddle schemas collide when combined as-is', () => {
    /** @type {ReturnType<horizontallyScaled>} */
    let apps;
    before(() => {
      apps = horizontallyScaled(2, {
        engineOptions: {
          ...getCombinedEngineOptions(),
          moddleOptions: { camunda, zeebe },
        },
      });
    });
    after(() => apps.stop());

    Given('a Camunda 7 diagram is deployed', () => {
      return createDeployment(apps.balance(), 'c7-colliding-moddle', camunda7Source);
    });

    let response;
    When('process is started', async () => {
      response = await request(apps.balance())
        .post('/rest/process-definition/c7-colliding-moddle/start')
        .send({
          variables: { foo: 'bar' },
        });
    });

    Then('start fails since the process element is unparsable', () => {
      expect(response.statusCode, response.text).to.be.above(499);
      expect(response.body)
        .to.have.property('message')
        .that.match(/no executable process/i);
    });
  });
});

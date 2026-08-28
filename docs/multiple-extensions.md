# Multiple extensions

The middleware engine options accept any number of [bpmn-elements](https://npmjs.com/package/bpmn-elements) extensions. A common combination is [@onify/flow-extensions](https://npmjs.com/package/@onify/flow-extensions), that picks up Camunda 7 `camunda:` extension elements, together with [@0dep/bpmn-extensions](https://npmjs.com/package/@0dep/bpmn-extensions), that picks up Camunda 8 `zeebe:` extension elements and FEEL expressions.

The extension runtimes coexist, and extension activation order makes no difference. Three things need attention when combining them:

## Moddle schemas collide

[camunda-bpmn-moddle](https://npmjs.com/package/camunda-bpmn-moddle) and [zeebe-bpmn-moddle](https://npmjs.com/package/zeebe-bpmn-moddle) both extend the same bpmn base types with the modeler metadata properties `modelerTemplate`, `modelerTemplateVersion`, and `versionTag`. Moddle refuses the double property definition. The `<process>` element then becomes unparsable and every start request fails with:

```
Error: No executable processes
```

This happens for all diagrams, including pure Camunda 7 diagrams that never use any `zeebe:` elements. The remedy is to strip the colliding properties from one of the schemas before passing them as moddle options. They carry no runtime behaviour, only modeler metadata.

## One extend function

Both packages export an `extendFn` for [moddle-context-serializer](https://npmjs.com/package/moddle-context-serializer), but the engine takes only one. Compose them into a wrapper function.

## Scope the zeebe extension

The zeebe extension applies Camunda 8 semantics to every element it is activated for. A user task completion payload, for instance, merges into the process variables as it would in Camunda 8. In a pure Camunda 7 diagram, where the onify extension already maps the signal payload through `camunda:inputOutput`, that shows up as surprise extra output. Guard the factory so it only activates for elements that carry `zeebe:` extension elements:

```js
function scopedZeebeExtensions(element, context) {
  const values = element.behaviour.extensionElements?.values;
  if (!values?.some((ext) => ext.$type?.startsWith('zeebe:'))) return;
  return zeebeExtensions(element, context);
}
```

See [example/app.js](../example/app.js) for the guard in use.

## Elements without extensions

Both extension factories return `undefined` for elements carrying nothing they act on, e.g. a user task without `camunda:inputOutput` or `zeebe:` extension elements (`@onify/flow-extensions@>=10.0.1`). bpmn-elements then runs the element untouched, so its output, e.g. the user task signal body, never reaches `environment.output`. Set the engine setting `assignOutput` (`bpmn-elements@>=18.0.22`) to have bpmn-elements attach its built-in output extension to those elements: `'auto'` merges object output into `environment.output` and keys other output by activity id, `'id'` always keys by activity id. The middleware signal body, less the routing `id` and `executionId`, is the output, so `{ "id": "task", "message": { "approved": true } }` ends up as `{ "message": { "approved": true } }`.

```js
const middleware = bpmnEngineMiddleware({
  engineOptions: {
    settings: { assignOutput: 'auto' },
    extensions: { onify: onifyExtensions, zeebe: scopedZeebeExtensions },
  },
});
```

## Example

```javascript
import assert from 'node:assert';
import { createRequire } from 'node:module';

import { Engine } from 'bpmn-engine';
import * as bpmnElements from 'bpmn-elements';
import {
  extensions as onifyExtensions,
  extendFn as onifyExtendFn,
  OnifySequenceFlow,
  OnifyTimerEventDefinition,
} from '@onify/flow-extensions';
import { extensions as zerodepExtensions, extendFn as zerodepExtendFn } from '@0dep/bpmn-extensions';

const nodeRequire = createRequire(import.meta.url);

const camunda = nodeRequire('camunda-bpmn-moddle/resources/camunda.json');
const zeebe = nodeRequire('zeebe-bpmn-moddle/resources/zeebe.json');

/**
 * Strip zeebe extension properties that collide with the camunda schema
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
 * Compose both extend functions
 * @param {any} behaviour
 * @param {any} element
 */
function combinedExtendFn(behaviour, element) {
  onifyExtendFn(behaviour, element);
  zerodepExtendFn(behaviour);
}

export const engineOptions = {
  moddleOptions: { camunda, zeebe: stripCollidingModdleProperties(zeebe) },
  elements: {
    ...bpmnElements,
    SequenceFlow: OnifySequenceFlow,
    TimerEventDefinition: OnifyTimerEventDefinition,
  },
  extensions: { onify: onifyExtensions, zerodep: zerodepExtensions },
  extendFn: combinedExtendFn,
};

// Verify with a diagram that uses both camunda and zeebe extension elements
const source = `<?xml version="1.0" encoding="UTF-8"?>
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

const engine = new Engine({
  name: 'combined-extensions',
  source,
  variables: { foo: 'bar' },
  ...engineOptions,
});

const end = engine.waitFor('end');
await engine.execute();
await end;

assert.deepEqual(engine.environment.output, { zeebeOut: 'bar', camundaOut: 'bar' });

console.log(engine.environment.output);
```

Pass the same options to the middleware:

```js
import express from 'express';
import { bpmnEngineMiddleware, MemoryAdapter } from 'bpmn-middleware';

const app = express();
app.use('/rest', bpmnEngineMiddleware({ adapter: new MemoryAdapter(), engineOptions }));
```

The combination is covered by [test/features/combined-extensions-feature.js](../test/features/combined-extensions-feature.js), including that extension activation order can be reversed and that state saved by one app instance resumes on another with both extension packages active.

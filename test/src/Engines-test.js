import { Broker } from 'smqp';
import { EventEmitter } from 'events';

import { BpmnEngines } from '../../src/Engines.js';
import { MemoryAdapter } from '../../src/MemoryAdapter.js';

describe('Engines', () => {
  it('clears added listeners when run completes', async () => {
    const broker = new Broker();

    const engines = new BpmnEngines({
      idleTimeout: 1000,
      adapter: new MemoryAdapter(),
      broker,
    });

    const listener = new EventEmitter();

    const end = new Promise((resolve) => listener.once('end', resolve));

    const execution = await engines.execute({
      name: 'foo',
      token: 'token',
      listener,
      source: `<?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="bp" isExecutable="true">
          <task id="task" />
        </process>
      </definitions>`,
    });

    await end;

    expect(execution.state).to.equal('idle');
    expect(execution.broker.getQueue('state-q').consumerCount).to.equal(0);
  });
});

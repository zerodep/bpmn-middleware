import { Broker } from 'smqp';
import { EventEmitter } from 'events';

import { Engines } from '../../src/Engines.js';
import { MemoryAdapter } from '../../src/MemoryAdapter.js';

describe('Engines', () => {
  describe('listener', () => {
    it('clears added listeners when run completes', async () => {
      const broker = new Broker();

      const engines = new Engines({
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

  describe('getEngineStatus(engine)', () => {
    const source = `<?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="bp" isExecutable="true">
        <task id="task" />
        <boundaryEvent id="timer" attachedToRef="task">
          <timerEventDefinition>
            <timeDuration xsi:type="tFormalExpression">PT10S</timeDuration>
          </timerEventDefinition>
        </boundaryEvent>
      </process>
    </definitions>`;

    it('new engine status lacks postponed activities and expireAt', () => {
      const broker = new Broker();

      const engines = new Engines({
        idleTimeout: 1000,
        adapter: new MemoryAdapter(),
        broker,
      });

      const execution = engines.createEngine({ source });

      const status = engines.getEngineStatus(execution);
      expect(status).to.have.property('postponed').with.length(0);
      expect(status).to.not.have.property('expiredAt');
    });

    it('completed engine status lacks postponed activities and expireAt', async () => {
      const broker = new Broker();

      const engines = new Engines({
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
        source,
      });

      await end;

      const status = engines.getEngineStatus(execution);
      expect(status).to.have.property('postponed').with.length(0);
      expect(status).to.not.have.property('expiredAt');
    });
  });
});

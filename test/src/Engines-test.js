import { Broker } from 'smqp';
import { EventEmitter } from 'events';

import { MemoryAdapter, Engines } from '../../src/index.js';

describe('Engines', () => {
  describe('execute', () => {
    it('execute without token adds token guid', async () => {
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

      expect(execution.token).to.be.ok;
    });
  });

  describe('engine broker', () => {
    it('removes state exchange and queue when run completes', async () => {
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
      expect(execution.broker.getExchange('state')).to.not.be.ok;
      expect(execution.broker.getQueue('state-q')).to.not.be.ok;
    });

    it('removes state exchange and queue if run fails', async () => {
      const broker = new Broker();

      const engines = new Engines({
        idleTimeout: 1000,
        adapter: new MemoryAdapter(),
        broker,
      });

      const listener = new EventEmitter();

      const error = new Promise((resolve) => listener.once('error', resolve));

      const execution = await engines.execute({
        name: 'foo',
        token: 'token',
        listener,
        source: `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <scriptTask id="task" scriptFormat="javascript">
              <script>next(new Error('Expected'));</script>
            </scriptTask>
          </process>
        </definitions>`,
      });

      await error;

      expect(execution.state).to.equal('error');
      expect(execution.broker.getExchange('state')).to.not.be.ok;
      expect(execution.broker.getQueue('state-q')).to.not.be.ok;
    });

    it('removes state exchange and queue when run is stopped', async () => {
      const broker = new Broker();

      const engines = new Engines({
        idleTimeout: 1000,
        adapter: new MemoryAdapter(),
        broker,
      });

      const listener = new EventEmitter();

      const stopped = new Promise((resolve) => listener.once('stop', resolve));

      const execution = await engines.execute({
        name: 'foo',
        token: 'token',
        listener,
        source: `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <manualTask id="task" />
          </process>
        </definitions>`,
      });

      execution.stop();

      await stopped;

      expect(execution.state).to.equal('stopped');
      expect(execution.broker.getExchange('state')).to.not.be.ok;
      expect(execution.broker.getQueue('state-q')).to.not.be.ok;
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

  describe('Services factory', () => {
    const source = `<?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <process id="bp" isExecutable="true">
        <serviceTask id="save" implementation="\${environment.services.saveState}" />
        <sequenceFlow id="to-task" sourceRef="save" targetRef="task" />
        <serviceTask id="task" implementation="\${environment.services.foo}" />
      </process>
    </definitions>`;

    it('keeps condigured services when executed', async () => {
      const broker = new Broker();

      const engines = new Engines({
        idleTimeout: 1000,
        adapter: new MemoryAdapter(),
        broker,
        source,
        engineOptions: {
          services: {
            foo(...args) {
              args.pop()();
            },
          },
        },
        Services() {},
      });

      const listener = new EventEmitter();

      const end = new Promise((resolve) => listener.once('end', resolve));

      await engines.execute({
        name: 'foo',
        token: 'token',
        listener,
        source,
      });

      return end;
    });

    it('keeps engine services when resumed', async () => {
      const engines = new Engines({
        idleTimeout: 1000,
        adapter: new MemoryAdapter(),
        broker: new Broker(),
        source,
        engineOptions: {
          services: {
            foo() {},
          },
        },
        Services() {},
      });

      const execution = await engines.execute({
        name: 'foo',
        token: 'foo-token',
        source,
      });

      engines.stopAll();

      engines.Services = function ServicesFactory() {
        return {
          foo(...args) {
            args.pop()();
          },
        };
      };

      const listener = new EventEmitter();

      const end = new Promise((resolve) => listener.once('end', resolve));

      engines.resume(execution.token, listener);

      const ended = await end;
      expect(ended).to.have.property('token', 'foo-token');
    });

    it('services factory function is called with engine scope (this)', async () => {
      const engines = new Engines({
        idleTimeout: 1000,
        adapter: new MemoryAdapter(),
        broker: new Broker(),
        source,
        Services: function serviceFactory() {
          this.addService('foo', () => {});
        },
      });

      const execution = await engines.execute({
        name: 'foo',
        token: 'foo-token',
        source,
      });

      engines.stopAll();

      engines.Services = function resumeServiceFactory() {
        this.addService('foo', (...args) => args.pop()());
      };

      const listener = new EventEmitter();

      const end = new Promise((resolve) => listener.once('end', resolve));

      engines.resume(execution.token, listener);

      const ended = await end;
      expect(ended).to.have.property('token', 'foo-token');
    });

    it('on resume services factory function is called after recover', async () => {
      const engines = new Engines({
        idleTimeout: 1000,
        adapter: new MemoryAdapter(),
        broker: new Broker(),
        source,
        Services: function serviceFactory() {
          this.addService('foo', () => {});
        },
      });

      const execution = await engines.execute({
        name: 'foo',
        token: 'foo-token',
        source,
        settings: {
          bar: 'baz',
        },
      });

      engines.stopAll();

      engines.Services = function resumeServiceFactory() {
        if (this.settings.bar === 'baz') {
          this.addService('foo', (...args) => args.pop()());
        }
      };

      const listener = new EventEmitter();

      const end = new Promise((resolve) => listener.once('end', resolve));

      engines.resume(execution.token, listener);

      const ended = await end;
      expect(ended).to.have.property('token', 'foo-token');
    });
  });
});

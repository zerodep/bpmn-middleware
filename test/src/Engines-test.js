import { EventEmitter } from 'node:events';
import { Broker } from 'smqp';

import { MemoryAdapter, Engines, STORAGE_TYPE_STATE } from '../../src/index.js';

describe('Engines', () => {
  describe('ctor', () => {
    it('throws if no options', () => {
      expect(() => new Engines()).to.throw(TypeError);
    });

    it('throws if no options.name', () => {
      expect(() => new Engines({})).to.throw(TypeError, /\.name/i);
      expect(() => new Engines({ name: {} })).to.throw(TypeError, /\.name/i);
    });

    it('throws if no options.adapter', () => {
      expect(() => new Engines({ name: 'event', broker: new Broker() })).to.throw(TypeError, /adapter/i);
    });

    it('throws if no options.broker', () => {
      expect(() => new Engines({ name: 'event', adapter: new MemoryAdapter() })).to.throw(TypeError, /broker/i);
    });
  });

  describe('execute', () => {
    it('execute without token adds token guid', async () => {
      const broker = new Broker();

      const engines = new Engines({
        name: 'event',
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

  describe('run', () => {
    it('run with callback that times out clears all timers and clears engine broker consumers', async () => {
      const broker = new Broker();

      const engines = new Engines({
        name: 'event',
        idleTimeout: 1000,
        adapter: new MemoryAdapter(),
        broker,
      });

      const listener = new EventEmitter();

      const error = new Promise((resolve) => listener.once('error', resolve));

      const engine = engines.createEngine({
        name: 'foo',
        listener,
        source: `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <manualTask id="task" />
          </process>
        </definitions>`,
      });

      await engines.run(engine, listener, () => {});

      engine.idleTimer.callback();

      await error;

      expect(engine.state).to.equal('error');
      expect(engine.environment.timers.executing.length).to.equal(0);
      expect(engine.broker.consumerCount).to.equal(0);
    });
  });

  describe('resume', () => {
    it('resume run with callback that times out clears all timers and clears engine broker consumers', async () => {
      const broker = new Broker();

      const engines = new Engines({
        name: 'event',
        idleTimeout: 1000,
        adapter: new MemoryAdapter(),
        broker,
      });

      const listener = new EventEmitter();

      const engine = engines.createEngine({
        name: 'foo',
        listener,
        settings: {
          autosaveEngineState: true,
        },
        source: `<?xml version="1.0" encoding="UTF-8"?>
          <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <process id="bp" isExecutable="true">
              <manualTask id="task" />
            </process>
          </definitions>`,
      });

      await engines.run(engine);

      engine.idleTimer.callback();

      expect(await engines.adapter.fetch(STORAGE_TYPE_STATE, engine.token)).to.be.ok;

      expect(engine.state).to.equal('stopped');
      expect(engine.environment.timers.executing.length).to.equal(0);
      expect(engine.broker.consumerCount, 'stopped consumerCount').to.equal(0);

      const resumedEngine = await engines.resume(engine.token, listener, {}, () => {});

      const error = new Promise((resolve) => resumedEngine.broker.subscribeOnce('event', 'engine.error', resolve));

      resumedEngine.idleTimer.callback();

      await error;

      expect(resumedEngine.state).to.equal('error');
      expect(resumedEngine.environment.timers.executing.length).to.equal(0);
      expect(resumedEngine.broker.consumerCount, 'stopped consumerCount').to.equal(0);
    });
  });

  describe('engine broker', () => {
    it('removes state exchange and queue when run completes', async () => {
      const broker = new Broker();

      const engines = new Engines({
        name: 'event',
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
        name: 'event',
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
        name: 'event',
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
        name: 'event',
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
        name: 'event',
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
        name: 'event',
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
        name: 'event',
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
        name: 'event',
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
        name: 'event',
        idleTimeout: 1000,
        adapter: new MemoryAdapter(),
        broker: new Broker(),
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

  describe('clone()', () => {
    it('returns a new engine instance with same options', () => {
      const engines = new Engines({
        name: 'event',
        idleTimeout: 1000,
        adapter: new MemoryAdapter(),
        broker: new Broker(),
        Services: function serviceFactory() {
          this.addService('foo', () => {});
        },
      });

      const clone = engines.clone();

      expect(clone).to.not.equal(engines);
      expect(clone.name).to.equal(engines.name);
      expect(clone.broker).to.equal(engines.broker);
      expect(clone.adapter).to.equal(engines.adapter);
      expect(clone.Services).to.equal(engines.Services);
    });

    it('with override options returns a new engine instance with overridden options', () => {
      const engines = new Engines({
        name: 'event',
        idleTimeout: 1000,
        adapter: new MemoryAdapter(),
        broker: new Broker(),
        Services: function serviceFactory() {
          this.addService('foo', () => {});
        },
      });

      const clone = engines.clone({ adapter: new MemoryAdapter(engines.adapter.storage) });

      expect(clone).to.not.equal(engines);
      expect(clone.name).to.equal(engines.name);
      expect(clone.broker).to.equal(engines.broker);
      expect(clone.adapter).be.instanceof(MemoryAdapter).and.not.to.equal(engines.adapter);
      expect(clone.Services).to.equal(engines.Services);
    });
  });
});

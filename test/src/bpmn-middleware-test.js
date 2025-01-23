import { EventEmitter } from 'node:events';
import { BpmnEngineMiddleware, MemoryAdapter, STORAGE_TYPE_STATE } from '../../src/index.js';

describe('BpmnEngineMiddleware', () => {
  describe('edge cases', () => {
    it('emits bpmn/warn event if call activity fails when notified that called process failed to start', () => {
      const middleware = new BpmnEngineMiddleware({ name: 'test', adapter: new MemoryAdapter() });

      const eventEmitter = new EventEmitter();
      const warn = new Promise((resolve) => eventEmitter.once('bpmn/warn', resolve));

      middleware.init({ app: eventEmitter }, {}, () => {});

      middleware.broker.publish('test', 'activity.call', { calledElement: 'deployment:called' }, { token: 'token' });

      return warn;
    });

    it('emits bpmn/warn event if cancel process by call activity fails', async () => {
      const middleware = new BpmnEngineMiddleware({ name: 'test', adapter: new MemoryAdapter() });

      await middleware.adapter.upsert(STORAGE_TYPE_STATE, 'child-token', {
        name: 'called',
        token: 'child-token',
        state: 'running',
        caller: { token: 'token' },
      });

      const eventEmitter = new EventEmitter();
      const warn = new Promise((resolve) => eventEmitter.once('bpmn/warn', resolve));

      middleware.init({ app: eventEmitter }, {}, () => {});

      middleware.broker.publish(
        'test',
        'activity.call.cancel',
        { calledElement: 'deployment:called' },
        { deployment: 'parent', token: 'token' }
      );

      return warn;
    });
  });
});

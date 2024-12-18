import { EventEmitter } from 'node:events';
import { BpmnEngineMiddleware, MemoryAdapter } from '../../src/index.js';

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
  });
});

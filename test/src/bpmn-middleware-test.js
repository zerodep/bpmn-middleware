import { EventEmitter } from 'node:events';
import { BpmnEngineMiddleware, MemoryAdapter, STORAGE_TYPE_STATE, STORAGE_TYPE_FILE } from 'bpmn-middleware';

describe('BpmnEngineMiddleware', () => {
  describe('edge cases', () => {
    it('emits bpmn/warn event if call activity fails when notified that called process failed to start', () => {
      const middleware = new BpmnEngineMiddleware({ name: 'test', adapter: new MemoryAdapter() });

      const eventEmitter = new EventEmitter();
      const warn = new Promise((resolve) => eventEmitter.once('bpmn/warn', resolve));

      middleware.init(/** @type {any} */ ({ app: eventEmitter }), /** @type {any} */ ({}), () => {});

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

      middleware.init(/** @type {any} */ ({ app: eventEmitter }), /** @type {any} */ ({}), () => {});

      middleware.broker.publish(
        'test',
        'activity.call.cancel',
        { calledElement: 'deployment:called' },
        { deployment: 'parent', token: 'token' }
      );

      return warn;
    });

    it('emits bpmn/warn event if calling process cannot be signalled when called process completes without settings', async () => {
      const middleware = new BpmnEngineMiddleware({ name: 'test', adapter: new MemoryAdapter() });

      const eventEmitter = new EventEmitter();
      const warn = new Promise((resolve) => eventEmitter.once('bpmn/warn', resolve));

      middleware.init(/** @type {any} */ ({ app: eventEmitter }), /** @type {any} */ ({}), () => {});

      middleware.broker.publish(
        'test',
        'definition.end',
        { caller: { token: 'parent-token', deployment: 'parent', id: 'call-activity', executionId: 'call-activity_0' }, output: {} },
        { deployment: 'called', token: 'child-token' }
      );

      const err = await warn;
      expect(err).to.be.instanceof(Error);
    });
  });

  describe('_resolveProcessDefinition', () => {
    it('falls back to process definition id as deployment name if adapter returns nothing', async () => {
      const adapter = new MemoryAdapter();
      adapter.fetch = () => Promise.resolve(undefined);

      const middleware = new BpmnEngineMiddleware({ name: 'test', adapter });

      const req = /** @type {any} */ ({ params: {}, body: { processDefinitionId: 'my-process', variables: { foo: 'bar' } } });
      const res = /** @type {any} */ ({ locals: {} });

      await new Promise((resolve, reject) => middleware._resolveProcessDefinition(req, res, (err) => (err ? reject(err) : resolve())));

      expect(req.params).to.have.property('deploymentName', 'my-process');
      expect(req.body).to.deep.equal({ variables: { foo: 'bar' } });
      expect(res.locals).to.have.property('processDefinitionId', 'my-process');
    });
  });

  describe('_addProcessDefinitions', () => {
    it('throws generic bad request if diagram parsing throws a non-error', async () => {
      const middleware = new BpmnEngineMiddleware({
        name: 'test',
        adapter: new MemoryAdapter(),
        engineOptions: {
          extendFn() {
            throw 'not an error';
          },
        },
      });

      await middleware.adapter.upsert(STORAGE_TYPE_FILE, 'weird.bpmn', {
        content: `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
          <process id="bp" isExecutable="true">
            <task id="task" />
          </process>
        </definitions>`,
      });

      try {
        await middleware._addProcessDefinitions('weird', 'weird.bpmn', '<default>');
      } catch (err) {
        // eslint-disable-next-line no-var
        var error = err;
      }

      expect(error).to.be.instanceof(Error).with.property('statusCode', 400);
      expect(error.message).to.equal('failed to parse weird.bpmn');
    });
  });
});

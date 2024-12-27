import * as ck from 'chronokinesis';

import { MiddlewareEngine, DEFAULT_IDLE_TIMER } from '../../src/index.js';
import { fakeTimers } from '../helpers/test-helpers.js';

const source = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <process id="bp" isExecutable="true">
    <userTask id="task" />
    <boundaryEvent id="bound-timer" attachedToRef="task" cancelActivity="false">
      <timerEventDefinition>
        <timeDuration xsi:type="tFormalExpression">PT10M</timeDuration>
      </timerEventDefinition>
    </boundaryEvent>
  </process>
</definitions>`;

describe('MiddlewareEngine', () => {
  afterEach(ck.reset);

  describe('startIdleTimer()', () => {
    it('picks idleTimeout delay from environment.settings', async () => {
      const timers = fakeTimers();
      const engine = new MiddlewareEngine('token', {
        source,
        timers,
        settings: { idleTimeout: 3000 },
      });

      await engine.execute();
      engine.startIdleTimer();

      expect(engine.idleTimer).to.have.property('delay', 3000);
    });

    it(`defaults delay to ${DEFAULT_IDLE_TIMER} ms`, async () => {
      const timers = fakeTimers();
      const engine = new MiddlewareEngine('token', {
        source,
        timers,
      });

      await engine.execute();
      engine.startIdleTimer();

      expect(engine.idleTimer).to.have.property('delay', DEFAULT_IDLE_TIMER);
    });

    it('publish message on event broker when timed out', async () => {
      const timers = fakeTimers();
      const engine = new MiddlewareEngine('token', {
        name: 'take 5',
        settings: { idleTimeout: 1000 * 60 * 10 },
        source,
        timers,
      });

      await engine.execute();
      engine.startIdleTimer();

      let message;
      engine.broker.subscribeOnce('event', 'engine.idle.timer', (_, msg) => {
        message = msg;
      });

      engine.idleTimer.callback();

      expect(message.content).to.have.property('name', 'take 5');
      expect(message.content).to.have.property('token', 'token');
      expect(message.content).to.have.property('activityStatus', 'timer');
    });
  });

  describe('.expireAt', () => {
    it('returns closest time duration expireAt', async () => {
      ck.freeze();

      const timers = fakeTimers();
      const engine = new MiddlewareEngine('token', {
        source: `<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <process id="bp" isExecutable="true">
            <userTask id="task" />
            <boundaryEvent id="bound-medium-timer" attachedToRef="task" cancelActivity="false">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT1M</timeDuration>
              </timerEventDefinition>
            </boundaryEvent>
            <boundaryEvent id="bound-long-timer" attachedToRef="task" cancelActivity="false">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT10M</timeDuration>
              </timerEventDefinition>
            </boundaryEvent>
            <boundaryEvent id="bound-short-timer" attachedToRef="task" cancelActivity="false">
              <timerEventDefinition>
                <timeDuration xsi:type="tFormalExpression">PT30S</timeDuration>
              </timerEventDefinition>
            </boundaryEvent>
          </process>
        </definitions>`,
        timers,
        settings: { idleTimeout: 1000 },
      });

      await engine.execute();

      expect(engine.expireAt).to.deep.equal(new Date(Date.now() + 1000 * 30));
    });

    it('returns time duration expireAt and ignores idle timer', async () => {
      ck.freeze();

      const timers = fakeTimers();
      const engine = new MiddlewareEngine('token', {
        source,
        timers,
        settings: { idleTimeout: 1000 },
      });

      await engine.execute();
      engine.startIdleTimer();

      expect(engine.expireAt).to.deep.equal(new Date(Date.now() + 1000 * 60 * 10));
    });
  });

  describe('stop', () => {
    it('clears idle timer when stopped', async () => {
      const timers = fakeTimers();
      const engine = new MiddlewareEngine('token', {
        source,
        timers,
        settings: { idleTimeout: 3000 },
      });

      await engine.execute();
      engine.startIdleTimer();

      expect(engine.environment.timers.executing, 'executing').to.have.length(2);
      expect(timers.options.registered, 'timer refs').to.have.length(2);
      expect(engine.idleTimer).to.have.property('delay', 3000);

      engine.stop();

      expect(timers.options.registered).to.have.length(0);
    });
  });
});

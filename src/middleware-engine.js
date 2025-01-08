import { Engine } from 'bpmn-engine';
import { DEFAULT_IDLE_TIMER } from './constants.js';

const kToken = Symbol.for('engine token');

export class MiddlewareEngine extends Engine {
  /**
   * @param {string} token
   * @param {import('types').MiddlewareEngineOptions} [options]
   */
  constructor(token, options) {
    super(options);
    /** @type {import('types').MiddlewareEngineOptions} */
    this.options = options;
    /**
     * Engine execution token
     * @type {string}
     */
    this[kToken] = token;
    /**
     * Execution idle timer
     * @type {import('bpmn-elements').Timer | null | void}
     */
    this.idleTimer = null;

    this.sync = options.sync;
    this.engineTimers = this.environment.timers.register({ id: token, type: 'bpmn-middleware:engine' });
  }
  get token() {
    return this[kToken];
  }
  /**
   * Closest due time when a registered timer expires
   * Ignores idle timer
   */
  get expireAt() {
    /** @type {Date?} */
    let expireAt = null;
    const token = this.token;
    for (const timer of this.environment.timers.executing) {
      if (timer.owner?.id === token) continue;
      if (!expireAt) expireAt = timer.expireAt;
      else if (timer.expireAt < expireAt) expireAt = timer.expireAt;
    }
    return expireAt;
  }
  /**
   * Start/Restart execution idle timer
   * @param {(engine: MiddlewareEngine, delay:number) => void} [customHandler] optional idle timeout handler function
   * @param {number} [delay] optional delay
   */
  startIdleTimer(customHandler, delay) {
    const engineTimers = this.engineTimers;
    const current = this.idleTimer;
    if (current) this.idleTimer = engineTimers.clearTimeout(current);
    if (this.state !== 'running') return;

    const delayMs = delay ?? this.environment.settings.idleTimeout ?? DEFAULT_IDLE_TIMER;

    const timeoutHandler = customHandler ? () => customHandler(this, delayMs) : this._idleTimeoutHandler.bind(this, delayMs);

    this.idleTimer = engineTimers.setTimeout(timeoutHandler, delayMs);
  }
  /**
   * @internal
   * @param {number} delay
   */
  _idleTimeoutHandler(delay) {
    const status = this._getCurrentStatus();
    switch (status.activityStatus) {
      case 'executing':
        break;
      case 'wait': {
        this.idleTimer = null;
        return this.stop();
      }
      case 'timer': {
        if (status.expireAt > new Date(Date.now() + delay * 2)) {
          this.idleTimer = null;
          return this.stop();
        }
        break;
      }
    }

    this.startIdleTimer(null, delay);
    return this.broker.publish('event', 'engine.idle.timer', status);
  }
  /** @interal */
  _getCurrentStatus() {
    const expireAt = this.expireAt;
    return {
      name: this.name,
      token: this.token,
      activityStatus: this.activityStatus,
      ...(expireAt && { expireAt }),
    };
  }
}

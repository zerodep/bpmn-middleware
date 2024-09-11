import { Engine } from 'bpmn-engine';

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
    this.token = token;
    /**
     * Execution idle timer
     * @type {import('bpmn-elements').Timer | null | void}
     */
    this.idleTimer = null;
    this.engineTimers = this.environment.timers.register({ id: token });
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
   */
  startIdleTimer() {
    const delay = this.environment.settings.idleTimeout ?? 120000;
    const engineTimers = this.engineTimers;
    const current = this.idleTimer;
    if (current) this.idleTimer = engineTimers.clearTimeout(current);
    if (this.state !== 'running') return;

    this.idleTimer = engineTimers.setTimeout(() => {
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

      this.startIdleTimer();
      return this.broker.publish('event', 'engine.idle.timer', status);
    }, delay);
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

import { Engine } from 'bpmn-engine';

export class MiddlewareEngine extends Engine {
  constructor(token, ...args) {
    super(...args);
    this.token = token;
    this.idleTimer = null;
    this.engineTimers = this.environment.timers.register({ id: token });
  }
  get expireAt() {
    let expireAt = null;
    const token = this.token;
    for (const timer of this.environment.timers.executing) {
      if (timer.owner?.id === token) continue;
      if (!expireAt) expireAt = timer.expireAt;
      else if (timer.expireAt < expireAt) expireAt = timer.expireAt;
    }
    return expireAt;
  }
  startIdleTimer() {
    const delay = this.environment.settings.idleTimeout ?? 120000;
    const timers = this.engineTimers;
    const current = this.idleTimer;
    if (current) this.idleTimer = timers.clearTimeout(current);
    if (this.state !== 'running') return;

    this.idleTimer = timers.setTimeout(() => {
      const status = this._getCurrentStatus();
      switch (status.activityStatus) {
        case 'executing':
          break;
        default: {
          const expireAt = status.expireAt;
          if (expireAt !== null && expireAt < new Date(Date.now() + delay * 2)) break;
          this.idleTimer = null;
          return this.stop();
        }
      }

      this.startIdleTimer();
      return this.broker.publish('event', 'engine.idle.timer', status);
    }, delay);
  }
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

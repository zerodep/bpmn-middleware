export class MiddlewareEngine extends Engine {
    /**
     * @param {string} token
     * @param {import('./interfaces.js').MiddlewareEngineOptions} [options]
     */
    constructor(token: string, options?: import("./interfaces.js").MiddlewareEngineOptions);
    /**
     * Execution idle timer
     * @type {import('bpmn-elements').Timer | null}
     */
    idleTimer: import("bpmn-elements").Timer | null;
    sync: boolean;
    engineTimers: import("bpmn-elements").RegisteredTimer;
    get token(): string;
    /**
     * Closest due time when a registered timer expires
     * Ignores idle timer
     */
    get expireAt(): Date;
    /**
     * Start/Restart execution idle timer
     * @param {(engine: MiddlewareEngine, delay:number) => void} [customHandler] optional idle timeout handler function
     * @param {number} [delay] optional delay
     */
    startIdleTimer(customHandler?: (engine: MiddlewareEngine, delay: number) => void, delay?: number): void;
    /**
     * @internal
     * @param {number} delay
     */
    _idleTimeoutHandler(delay: number): number | Promise<void>;
    /** @internal */
    _getCurrentStatus(): {
        expireAt: Date;
        name: string;
        token: string;
        activityStatus: import("bpmn-elements").ActivityStatus;
    };
    /**
     * Engine execution token
     * @internal
     * @type {string}
     */
    [kToken]: string;
}
import { Engine } from 'bpmn-engine';
declare const kToken: unique symbol;
export {};
//# sourceMappingURL=middleware-engine.d.ts.map
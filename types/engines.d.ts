/**
 * Engines class
 * @param {import('./interfaces.js').BpmnMiddlewareOptions} options
 */
export function Engines(options: import("./interfaces.js").BpmnMiddlewareOptions): void;
export class Engines {
    /**
     * Engines class
     * @param {import('./interfaces.js').BpmnMiddlewareOptions} options
     */
    constructor(options: import("./interfaces.js").BpmnMiddlewareOptions);
    engineOptions: import("bpmn-engine").BpmnEngineOptions;
    idleTimeout: number;
    /** @type {LRUCache<string, MiddlewareEngine, unknown>} */
    engineCache: LRUCache<string, MiddlewareEngine, unknown>;
    autosaveEngineState: boolean;
    Scripts: (adapter: import("./interfaces.js").IStorageAdapter, deploymentName: string, businessKey?: string) => import("bpmn-elements").IScripts;
    Services: (this: import("bpmn-elements").Environment, adapter: import("./interfaces.js").IStorageAdapter, deploymentName: string, businessKey?: string) => Record<string, import("bpmn-elements").ServiceFunction> | void;
    /** @internal Bound state message handler */
    __onStateMessage: (routingKey: string, message: import("smqp").Message, engine: MiddlewareEngine) => Promise<void>;
    get name(): string;
    get broker(): import("smqp").Broker;
    get adapter(): import("./interfaces.js").IStorageAdapter;
    get running(): MiddlewareEngine[];
    /**
     * Clone engines instance
     * @param {Partial<import('./interfaces.js').BpmnMiddlewareOptions>} [overrideOptions]
     * @returns {Engines}
     */
    clone(overrideOptions?: Partial<import("./interfaces.js").BpmnMiddlewareOptions>): Engines;
    /**
     * Create and execute engine from options
     * @param {import('./interfaces.js').MiddlewareEngineOptions} executeOptions
     */
    execute(executeOptions: import("./interfaces.js").MiddlewareEngineOptions): Promise<MiddlewareEngine>;
    /**
     * Run prepared engine
     * @param {MiddlewareEngine} engine
     * @param {import('bpmn-engine').IListenerEmitter} [listener]
     * @param {(err: Error, engine: import('bpmn-engine').Execution)=>void} [callback]
     */
    run(engine: MiddlewareEngine, listener?: import("bpmn-engine").IListenerEmitter, callback?: (err: Error, engine: import("bpmn-engine").Execution) => void): Promise<MiddlewareEngine>;
    /**
     * Resume engine execution
     * @param {string} token
     * @param {import('bpmn-engine').IListenerEmitter} [listener]
     * @param {import('./interfaces.js').ExecuteOptions} [options]
     * @param {(err: Error, engine: import('bpmn-engine').Execution)=>void} [callback] resume run completed callback
     * @returns {Promise<MiddlewareEngine>}
     */
    resume(token: string, listener?: import("bpmn-engine").IListenerEmitter, options?: import("./interfaces.js").ExecuteOptions, callback?: (err: Error, engine: import("bpmn-engine").Execution) => void): Promise<MiddlewareEngine>;
    /**
     * Signal activity
     * @param {string} token
     * @param {import('bpmn-engine').IListenerEmitter} listener
     * @param {import('./interfaces.js').SignalBody} body
     * @param {import('./interfaces.js').ExecuteOptions} [options]
     * @param {(err: Error, engine: import('bpmn-engine').Execution)=>void} [callback]
     */
    resumeAndSignalActivity(token: string, listener: import("bpmn-engine").IListenerEmitter, body: import("./interfaces.js").SignalBody, options?: import("./interfaces.js").ExecuteOptions, callback?: (err: Error, engine: import("bpmn-engine").Execution) => void): Promise<MiddlewareEngine>;
    /**
     * Cancel activity
     * @param {string} token
     * @param {import('bpmn-engine').IListenerEmitter} listener
     * @param {import('./interfaces.js').SignalBody} body
     * @param {import('./interfaces.js').ExecuteOptions} [options]
     * @param {(err: Error, engine: import('bpmn-engine').Execution)=>void} [callback]
     */
    resumeAndCancelActivity(token: string, listener: import("bpmn-engine").IListenerEmitter, body: import("./interfaces.js").SignalBody, options?: import("./interfaces.js").ExecuteOptions, callback?: (err: Error, engine: import("bpmn-engine").Execution) => void): Promise<MiddlewareEngine>;
    /**
     * Resume and fail activity
     * @param {string} token
     * @param {import('bpmn-engine').IListenerEmitter} listener
     * @param {import('./interfaces.js').SignalBody} body
     * @param {import('./interfaces.js').ExecuteOptions} [options]
     */
    resumeAndFailActivity(token: string, listener: import("bpmn-engine").IListenerEmitter, body: import("./interfaces.js").SignalBody, options?: import("./interfaces.js").ExecuteOptions): Promise<MiddlewareEngine>;
    /**
     * Get postponed activities by token
     * @param {string} token
     * @param {import('bpmn-engine').IListenerEmitter} listener
     * @returns {Promise<import('./interfaces.js').PostponedElement[]>}
     */
    getPostponed(token: string, listener: import("bpmn-engine").IListenerEmitter): Promise<import("./interfaces.js").PostponedElement[]>;
    /**
     * Get engine state by token
     * @param {string} token
     * @param {any} [options] adapter fetch options
     * @returns {Promise<import('./interfaces.js').MiddlewareEngineState>}
     */
    getStateByToken(token: string, options?: any): Promise<import("./interfaces.js").MiddlewareEngineState>;
    /**
     * Get engine status by token
     * @param {string} token
     * @param {any} [options] adapter fetch options
     * @returns {Promise<import('./interfaces.js').MiddlewareEngineStatus>}
     */
    getStatusByToken(token: string, options?: any): Promise<import("./interfaces.js").MiddlewareEngineStatus>;
    /**
     * Get running engines by querying storage
     * @param {any} [query]
     * @returns {Promise<import('./interfaces.js').RunningEngines>}
     */
    getRunning(query?: any): Promise<import("./interfaces.js").RunningEngines>;
    /**
     * Discards engine by token
     * @param {string} [token]
     * @param {import('bpmn-engine').IListenerEmitter} [listener]
     * @param {any} [options] resume options
     */
    discardByToken(token?: string, listener?: import("bpmn-engine").IListenerEmitter, options?: any): Promise<void>;
    /**
     * Get running engine by token
     * @param {string} token
     * @returns {MiddlewareEngine|undefined}
     */
    getByToken(token: string): MiddlewareEngine | undefined;
    /**
     * Delete engine state and stop engine by token
     * @param {string} token
     * @param {any} [options]
     */
    deleteByToken(token: string, options?: any): Promise<any>;
    /**
     * Stop engine by token
     * @param {string} token
     */
    stopByToken(token: string): void;
    /**
     * Stop all running engines
     */
    stopAll(): void;
    /**
     * Terminate engine by token
     * @param {string} token
     */
    terminateByToken(token: string): boolean;
    /**
     * Create middleware bpmn engine
     * @param {import('./interfaces.js').MiddlewareEngineOptions} executeOptions
     */
    createEngine(executeOptions: import("./interfaces.js").MiddlewareEngineOptions): MiddlewareEngine;
    /**
     * Get running engine status by token
     * @param {string} token
     * @returns {import('./interfaces.js').MiddlewareEngineStatus | undefined}
     */
    getEngineStatusByToken(token: string): import("./interfaces.js").MiddlewareEngineStatus | undefined;
    /**
     * Get engine status
     * @param {MiddlewareEngine} engine
     * @returns {import('./interfaces.js').MiddlewareEngineStatus}
     */
    getEngineStatus(engine: MiddlewareEngine): import("./interfaces.js").MiddlewareEngineStatus;
    /**
     * Create engine state
     * @param {MiddlewareEngine} engine
     */
    createEngineState(engine: MiddlewareEngine): import("./interfaces.js").MiddlewareEngineState;
    /**
     * Save engine state
     * @param {MiddlewareEngine} engine
     * @param {boolean} [ifExists] save engine state if existing state
     * @param {any} [options] adapter store options
     */
    saveEngineState(engine: MiddlewareEngine, ifExists?: boolean, options?: any): Promise<void>;
    /**
     * Internal setup engine listeners
     * @internal
     * @param {MiddlewareEngine} engine
     */
    _setupEngine(engine: MiddlewareEngine): void;
    /**
     * Internal on state message
     * @internal
     * @param {string} routingKey
     * @param {import('smqp').Message} message
     * @param {MiddlewareEngine} engine
     */
    _onStateMessage(routingKey: string, message: import("smqp").Message, engine: MiddlewareEngine): Promise<void>;
    /**
     * Internal teardown engine, remove listeners and stuff
     * @internal
     * @param {MiddlewareEngine} engine
     */
    _teardownEngine(engine: MiddlewareEngine): void;
    /** @internal */
    [kOptions]: {
        idleTimeout: number;
        engineCache: LRUCache<string, MiddlewareEngine, unknown> | LRUCache<string, import("bpmn-engine").Engine, unknown>;
        name?: string;
        basePath?: string;
        adapter?: import("./interfaces.js").IStorageAdapter;
        engineOptions?: import("bpmn-engine").BpmnEngineOptions;
        broker?: import("smqp").Broker;
        autosaveEngineState?: boolean;
        Scripts?: (adapter: import("./interfaces.js").IStorageAdapter, deploymentName: string, businessKey?: string) => import("bpmn-elements").IScripts;
        Services?: (this: import("bpmn-elements").Environment, adapter: import("./interfaces.js").IStorageAdapter, deploymentName: string, businessKey?: string) => Record<string, import("bpmn-elements").ServiceFunction> | void;
        maxRunning?: number;
    };
}
/**
 * LRU cache disposeAfter function
 * @param {import('bpmn-engine').Engine} engine
 * @param {string} _key
 * @param {LRUCache.DisposeReason} reason
 */
export function onEvictEngine(engine: import("bpmn-engine").Engine, _key: string, reason: LRUCache.DisposeReason): void;
import { LRUCache } from 'lru-cache';
import { MiddlewareEngine } from './middleware-engine.js';
declare const kOptions: unique symbol;
export {};
//# sourceMappingURL=engines.d.ts.map
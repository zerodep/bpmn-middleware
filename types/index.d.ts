declare module 'bpmn-middleware' {
	import type { BpmnEngineOptions, BpmnEngineExecutionState, BpmnEngineRunningStatus, Engine } from 'bpmn-engine';
	import type { ActivityStatus, ElementMessageContent, IScripts } from 'bpmn-elements';
	import type { Timer as ContextTimer } from 'moddle-context-serializer';
	import type { LRUCache } from 'lru-cache';
	import type { Broker } from 'smqp';
	/**
	 * BPMN 2 Engine middleware
	 * */
	export function bpmnEngineMiddleware(options: BpmnMiddlewareOptions): import("express-serve-static-core").Router;
	/**
	 * Bpmn Engine Middleware
	 * */
	export function BpmnEngineMiddleware(options: BpmnMiddlewareOptions, engines: Engines): void;
	export class BpmnEngineMiddleware {
		/**
		 * Bpmn Engine Middleware
		 * */
		constructor(options: BpmnMiddlewareOptions, engines: Engines);
		adapter: IStorageAdapter;
		engines: Engines;
		engineOptions: {
			[x: string]: any;
			name?: string;
			source?: string;
			sourceContext?: import("moddle-context-serializer").SerializableContext;
			elements?: Record<string, any>;
			typeResolver?: typeof import("moddle-context-serializer").TypeResolver;
			extendFn?: import("moddle-context-serializer").extendFn;
			moddleOptions?: any;
			moddleContext?: import("bpmn-moddle").Definitions;
			listener?: import("events") | import("bpmn-engine").IListenerEmitter;
			settings?: import("bpmn-elements").EnvironmentSettings;
			variables?: Record<string, any>;
			services?: Record<string, CallableFunction>;
			Logger?: import("bpmn-elements").LoggerFactory;
			timers?: import("bpmn-elements").ITimers;
			scripts?: import("bpmn-elements").IScripts;
			extensions?: Record<string, import("bpmn-elements").Extension>;
			expressions?: import("bpmn-elements").IExpressions;
		};
		/**
		 * Bound addEngineLocals
		 */
		_addEngineLocals: (req: import("express").Request, res: import("express").Response<any, BpmnMiddlewareLocals>, next: import("express").NextFunction) => void;
		/**
		 * Initialize engine
		 * */
		init(req: import("express").Request, _: import("express").Response, next: import("express").NextFunction): void;
		/**
		 * Add middleware response locals
		 * */
		addEngineLocals(req: import("express").Request, res: import("express").Response<any, BpmnMiddlewareLocals>, next: import("express").NextFunction): void;
		/**
		 * Get package version
		 * */
		getVersion(_: import("express").Request, res: import("express").Response<any, {
			version: string;
		}>): import("express").Response<any, {
			version: string;
		}>;
		/**
		 * Get deployment/package name
		 * */
		getDeployment(_: import("express").Request, res: import("express").Response<{
			name: string;
		}>): import("express").Response<{
			name: string;
		}, Record<string, any>>;
		/**
		 * Create deployment
		 * */
		create(req: import("express").Request, res: import("express").Response<CreateDeploymentResponseBody, BpmnMiddlewareLocals>, next: import("express").NextFunction): Promise<import("express").Response<CreateDeploymentResponseBody, BpmnMiddlewareLocals>>;
		/**
		 * Start deployment
		 * */
		start(req: import("express").Request<{
			deploymentName: string;
		}>, res: import("express").Response<{
			id: string;
		}, BpmnMiddlewareLocals>, next: import("express").NextFunction): Promise<import("express").Response<{
			id: string;
		}, BpmnMiddlewareLocals>>;
		/**
		 * Start deployment
		 * */
		getScript(req: import("express").Request<{
			deploymentName: string;
		}>, res: import("express").Response<string, BpmnMiddlewareLocals>, next: import("express").NextFunction): Promise<import("express").Response<string, BpmnMiddlewareLocals>>;
		/**
		 * Start deployment
		 * */
		getDeploymentTimers(req: import("express").Request<{
			deploymentName: string;
		}>, res: import("express").Response<{
			timers: ParsedTimerResult[];
		}>, next: import("express").NextFunction): Promise<import("express").Response<{
			timers: ParsedTimerResult[];
		}, Record<string, any>>>;
		/**
		 * Get running engines
		 * */
		getRunning(req: import("express").Request<StorageQuery>, res: import("express").Response<Awaited<ReturnType<Engines["getRunning"]>>, BpmnMiddlewareLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineState, BpmnMiddlewareLocals>>;
		/**
		 * Get engine status by token
		 * */
		getStatusByToken(req: import("express").Request, res: import("express").Response<Awaited<ReturnType<Engines["getStatusByToken"]>>, BpmnMiddlewareLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineStatus, BpmnMiddlewareLocals>>;
		/**
		 * Get engine activity status
		 * */
		getActivityStatus(req: import("express").Request<{
			token: string;
			activityId: string;
		}>, res: import("express").Response<PostponedElement, BpmnMiddlewareLocals>, next: import("express").NextFunction): Promise<void>;
		/**
		 * Signal activity
		 * */
		signalActivity(req: import("express").Request<{
			token: string;
		}, SignalBody>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineStatus, BpmnMiddlewareLocals>>;
		/**
		 * Cancel activity
		 * */
		cancelActivity(req: import("express").Request<{
			token: string;
		}, SignalBody>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineStatus, BpmnMiddlewareLocals>>;
		/**
		 * Fail activity
		 * */
		failActivity(req: import("express").Request<{
			token: string;
		}, SignalBody>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineStatus, BpmnMiddlewareLocals>>;
		/**
		 * Resume engine by token
		 * */
		resumeByToken(req: import("express").Request<{
			token: string;
		}>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineStatus, BpmnMiddlewareLocals>>;
		/**
		 * Get engine state by token
		 * */
		getStateByToken(req: import("express").Request<{
			token: string;
		}>, res: import("express").Response<Awaited<ReturnType<Engines["getStateByToken"]>>, BpmnMiddlewareLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineState, BpmnMiddlewareLocals>>;
		/**
		 * Delete engine by token
		 * */
		deleteStateByToken(req: import("express").Request<{
			token: string;
		}>, res: import("express").Response<void, BpmnMiddlewareLocals>, next: import("express").NextFunction): Promise<import("express").Response<void, BpmnMiddlewareLocals>>;
		/**
		 * Stop all running engines
		 * */
		internalStopAll(_: import("express").Request, res: import("express").Response): import("express").Response<any, Record<string, any>>;
		/**
		 * Stop engine by token
		 * */
		internalStopByToken(req: import("express").Request, res: import("express").Response): import("express").Response<any, Record<string, any>>;
		/**
		 * Internal start deployment
		 * @returns Started with id token
		 */
		_startDeployment(deploymentName: string, options: import("bpmn-engine").BpmnEngineOptions): Promise<{
			id: string;
		}>;
		/**
		 * Start process by call activity
		 * */
		_startProcessByCallActivity(callActivityApi: import("bpmn-elements").Api<import("bpmn-elements").Activity>): Promise<{
			id: string;
		}>;
		/**
		 * Cancel process by call activity
		 * */
		_cancelProcessByCallActivity(callActivityApi: import("bpmn-elements").Api<import("bpmn-elements").Activity>): Promise<void>;
		/**
		 * Post process engine run
		 * 
		 */
		_postProcessRun(engine: MiddlewareEngine, error?: Error): Promise<void>;
		/**
		 * Get deployment by name
		 * */
		_getDeploymentByName(deploymentName: string): Promise<any>;
		[kInitilialized]: boolean;
	}
	/**
	 * Bpmn prefix listener
	 * @param app Express app
	 */
	export function BpmnPrefixListener(app: import("express").Application): void;
	export class BpmnPrefixListener {
		/**
		 * Bpmn prefix listener
		 * @param app Express app
		 */
		constructor(app: import("express").Application);
		app: import("express").Application;
		/**
		 * Emit event on Express app
		 * */
		emit(eventName: string, ...args: any[]): boolean;
	}
	/**
	 * BPMN middleware locals
	 */
	export type BpmnMiddlewareLocals = {
		/**
		 * - Engine factory
		 */
		engines: Engines;
		/**
		 * - Storage adapter
		 */
		adapter: IStorageAdapter;
		/**
		 * - Bpmn engine listener
		 */
		listener: BpmnPrefixListener;
	};
	/**
	 * Create deployment result
	 */
	export type CreateDeploymentResponseBody = {
		/**
		 * - Deployment name
		 */
		id: string;
		/**
		 * - Storage adapter
		 */
		deploymentTime: Date;
		/**
		 * - Deployed process definitions
		 */
		deployedProcessDefinitions: any;
	};
	const kInitilialized: unique symbol;
  enum StorageType {
	State = 'state',
	Deployment = 'deployment',
	File = 'file',
  }

  interface BpmnMiddlewareOptions {
	adapter?: IStorageAdapter;
	/** Options passed to each created engine */
	engineOptions?: BpmnEngineOptions;
	/** Executing engines */
	engineCache?: LRUCache<string, any>;
	/** App broker, used for forwarding events from executing engines */
	broker?: Broker;
	/** Engine execution timeout before considered idle, defaults to 120000ms */
	idleTimeout?: number;
	/** Autosave engine state during execution */
	autosaveEngineState?: boolean;
	/** Scripts factory */
	Scripts?: (adapter: IStorageAdapter, deploymentName: string) => IScripts;
  }

  interface MiddlewareEngineOptions extends BpmnEngineOptions {
	token?: string;
	caller?: Caller;
	idleTimeout?: number;
	sequenceNumber?: number;
	expireAt?: Date;
  }

  interface StorageQuery {
	/** Fields to exclude */
	exclude?: string[];
	state?: string;
	caller?: Caller;
	[x: string]: any;
  }

  interface IStorageAdapter {
	upsert<T>(type: string | StorageType, key: string, value: T, options?: any): Promise<any>;
	update<T>(type: string | StorageType, key: string, value: T, options?: any): Promise<any>;
	fetch<T>(type: string | StorageType, key: string, options?: any): Promise<T>;
	delete(type: string | StorageType, key: string): Promise<any>;
	query<T>(type: string | StorageType, qs: StorageQuery, options?: any): Promise<{ records: T[]; [x: string]: any }>;
  }

  interface Caller {
	/** Calling process token */
	token: string;
	/** Calling process deployment name */
	deployment: string;
	/** Calling activity id */
	id: string;
	/** Calling activity type */
	type: string;
	/** Calling activity execution id */
	executionId: string;
  }

  type postponed = { id: string; type: string };

  interface MiddlewareEngineStatus {
	token: string;
	name: string;
	state?: BpmnEngineRunningStatus;
	activityStatus?: ActivityStatus;
	sequenceNumber?: number;
	postponed?: postponed[];
	caller?: Caller;
	expireAt?: Date;
	[x: string]: any;
  }

  interface MiddlewareEngineState extends MiddlewareEngineStatus {
	engine?: BpmnEngineExecutionState;
  }

  interface PostponedElement extends ElementMessageContent {
	token: string;
	/**
	 * Activity executions, e.g. executing multi-instance tasks or event definitions
	 */
	executing?: ElementMessageContent[];
  }

  interface SignalBody {
	/**
	 * Activity id
	 */
	id?: string;
	/**
	 * Activity execution id, required when signalling a parallel multi-instance tasks
	 */
	executionId?: string;
	[x: string]: any;
  }

  interface ParsedTimerResult extends ContextTimer {
	success: boolean;
	expireAt?: Date;
	delay?: Number;
	repeat?: Number;
	message?: string;
  }
	export const STORAGE_TYPE_DEPLOYMENT: "deployment";
	export const STORAGE_TYPE_STATE: "state";
	export const STORAGE_TYPE_FILE: "file";
	export const DEFAULT_IDLE_TIMER: 120000;
	export const SAVE_STATE_ROUTINGKEY: "activity.state.save";
	export const ENABLE_SAVE_STATE_ROUTINGKEY: "activity.state.save.enable";
	export const DISABLE_SAVE_STATE_ROUTINGKEY: "activity.state.save.disable";
	export const ERR_STORAGE_KEY_NOT_FOUND: "ERR_BPMN_MIDDLEWARE_STORAGE_KEY_NOT_FOUND";
	/**
	 * Engines class
	 * */
	export function Engines(options: BpmnMiddlewareOptions): void;
	export class Engines {
		/**
		 * Engines class
		 * */
		constructor(options: BpmnMiddlewareOptions);
		broker: import("smqp").Broker;
		engineOptions: import("bpmn-engine").BpmnEngineOptions;
		idleTimeout: number;
		adapter: IStorageAdapter;
		engineCache: LRUCache<string, any, unknown>;
		autosaveEngineState: boolean;
		Scripts: (adapter: IStorageAdapter, deploymentName: string) => import("bpmn-elements").IScripts;
		__onStateMessage: (routingKey: string, message: import("smqp").Message, engine: MiddlewareEngine) => Promise<boolean | void>;
		/**
		 * Execute engine
		 * */
		execute(executeOptions: MiddlewareEngineOptions): Promise<MiddlewareEngine>;
		/**
		 * Resume engine execution
		 * */
		resume(token: string, listener?: import("bpmn-engine").IListenerEmitter): Promise<MiddlewareEngine>;
		/**
		 * Signal activity
		 * */
		signalActivity(token: string, listener: import("bpmn-engine").IListenerEmitter, body: SignalBody): Promise<MiddlewareEngine>;
		/**
		 * Cancel activity
		 * */
		cancelActivity(token: string, listener: import("bpmn-engine").IListenerEmitter, body: SignalBody): Promise<MiddlewareEngine>;
		/**
		 * Fail activity
		 * */
		failActivity(token: string, listener: import("bpmn-engine").IListenerEmitter, body: SignalBody): Promise<MiddlewareEngine>;
		/**
		 * Get postponed activities by token
		 * */
		getPostponed(token: string, listener: import("bpmn-engine").IListenerEmitter): Promise<PostponedElement[]>;
		/**
		 * Get engine state by token
		 * */
		getStateByToken(token: string, options: any): Promise<MiddlewareEngineState>;
		/**
		 * Get engine status by token
		 * */
		getStatusByToken(token: string): Promise<MiddlewareEngineStatus>;
		/**
		 * Get running engines by query
		 * */
		getRunning(query?: any): Promise<MiddlewareEngineState>;
		/**
		 * Discards engine by token
		 * 
		 */
		discardByToken(token?: string): Promise<void>;
		/**
		 * Delete and stop engine by token
		 * */
		deleteByToken(token: string): Promise<any>;
		/**
		 * Stop engine by token
		 * */
		stopByToken(token: string): void;
		/**
		 * Stop all running engines
		 */
		stopAll(): void;
		/**
		 * Terminate engine by token
		 * */
		terminateByToken(token: string): boolean;
		/**
		 * Create middleware bpmn engine
		 * */
		createEngine(executeOptions: MiddlewareEngineOptions): MiddlewareEngine;
		/**
		 * Get running engine status by token
		 * */
		getEngineStatusByToken(token: string): MiddlewareEngineStatus;
		/**
		 * Get engine status
		 * */
		getEngineStatus(engine: MiddlewareEngine): MiddlewareEngineStatus;
		/**
		 * Create engine state
		 * */
		createEngineState(engine: MiddlewareEngine): MiddlewareEngineState;
		/**
		 * Save engine state
		 * @param ifExists save engine state if existing state
		 */
		saveEngineState(engine: MiddlewareEngine, ifExists?: boolean): Promise<void>;
		/**
		 * Internal setup engine listeners
		 * */
		_setupEngine(engine: MiddlewareEngine): void;
		/**
		 * Internal on state message
		 * */
		_onStateMessage(routingKey: string, message: import("smqp").Message, engine: MiddlewareEngine): Promise<boolean | void>;
		/**
		 * Internal teardown engine, remove listeners and stuff
		 * */
		_teardownEngine(engine: MiddlewareEngine): void;
		/**
		 * Internal get activity
		 * */
		_getActivityApi(engine: MiddlewareEngine, body: SignalBody): any;
	}
	export class MiddlewareEngine extends Engine {
		
		constructor(token: string, options?: MiddlewareEngineOptions);
		
		options: MiddlewareEngineOptions;
		/**
		 * Engine execution token
		 * */
		token: string;
		/**
		 * Execution idle timer
		 * */
		idleTimer: import("bpmn-elements").Timer | null | void;
		engineTimers: import("bpmn-elements").RegisteredTimer;
		/**
		 * Closest due time when a registered timer expires
		 * Ignores idle timer
		 */
		get expireAt(): Date;
		/**
		 * Start/Restart execution idle timer
		 */
		startIdleTimer(): void;
		_getCurrentStatus(): {
			expireAt: Date;
			name: string;
			token: string;
			activityStatus: import("bpmn-elements").ActivityStatus;
		};
	}
	/**
	 * Memory adapter
	 * 
	 */
	export function MemoryAdapter(storage?: import("lru-cache").LRUCache<string, any>): void;
	export class MemoryAdapter {
		/**
		 * Memory adapter
		 * 
		 */
		constructor(storage?: import("lru-cache").LRUCache<string, any>);
		
		storage: import("lru-cache").LRUCache<string, any>;
		/**
		 * Upsert
		 * @param type storage type
		 * @param key storage key
		 * @param value value to store
		 * @param options storage set options
		 */
		upsert(type: string, key: string, value: any, options?: any): Promise<void>;
		/**
		 * Update existing
		 * @param type storage type
		 * @param key storage key
		 * @param value value to store
		 * @param options storage set options
		 * */
		update(type: string, key: string, value: any, options?: any): Promise<void>;
		/**
		 * Delete
		 * */
		delete(type: string, key: string): Promise<void>;
		/**
		 * Fetch
		 * @param options Passed as fetch options to LRU cache
		 */
		fetch(type: string, key: string, options?: any): Promise<any>;
		/**
		 * Query
		 * */
		query(type: string, qs: any): Promise<{
			records: any[];
		}>;
		/**
		 * Internal query state
		 * */
		_queryState(qs: any): any[];
	}
	export class HttpError extends Error {
		/**
		 * Error with status code
		 * @param message Error message
		 * @param statusCode HTTP status code
		 */
		constructor(message: string, statusCode: number);
		statusCode: number;
	}
	export class StorageError extends Error {
		/**
		 * Error with status code
		 * @param message Error message
		 * @param code Error code
		 */
		constructor(message: string, code: string);
		code: string;
	}

	export {};
}

//# sourceMappingURL=index.d.ts.map
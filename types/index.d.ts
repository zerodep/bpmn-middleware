declare module 'bpmn-middleware' {
	import type { BpmnEngineOptions, BpmnEngineExecutionState, BpmnEngineRunningStatus, Engine } from 'bpmn-engine';
	import type { ActivityStatus, ElementMessageContent, IScripts, Environment } from 'bpmn-elements';
	import type { Timer as ContextTimer } from 'moddle-context-serializer';
	import type { LRUCache } from 'lru-cache';
	import type { Broker } from 'smqp';
	/**
	 * BPMN 2 Engine middleware
	 * */
	export function bpmnEngineMiddleware(options: BpmnMiddlewareOptions): import("express-serve-static-core").Router;
  enum StorageType {
	State = 'state',
	Deployment = 'deployment',
	File = 'file',
  }

  interface BpmnMiddlewareOptions {
	/** middleware name */
	name?: string;
	adapter?: IStorageAdapter;
	/** Options passed to each created engine */
	engineOptions?: BpmnEngineOptions;
	/** Executing engines */
	engineCache?: LRUCache<string, MiddlewareEngine, unknown>;
	/** App broker, used for forwarding events from executing engines */
	broker?: Broker;
	/** Engine execution timeout before considered idle, defaults to 120000ms */
	idleTimeout?: number;
	/** Autosave engine state during execution */
	autosaveEngineState?: boolean;
	/** Scripts factory */
	Scripts?: (adapter: IStorageAdapter, deploymentName: string, businessKey?: string) => IScripts;
	/** Services factory */
	Services?: (
	  this: Environment,
	  adapter: IStorageAdapter,
	  deploymentName: string,
	  businessKey?: string
	) => Record<string, CallableFunction>;
	/** Max running engines per instance */
	maxRunning?: number;
  }

  interface ExecuteOptions {
	autosaveEngineState?: boolean;
	/** Run until end */
	sync?: boolean;
	/** Idle timeout delay */
	idleTimeout?: number;
	[x: string]: any;
  }

  interface MiddlewareEngineOptions extends BpmnEngineOptions {
	token?: string;
	caller?: Caller;
	idleTimeout?: number;
	sequenceNumber?: number;
	expireAt?: Date;
	businessKey?: string;
	sync?: boolean;
  }

  interface StartDeploymentOptions {
	variables?: Record<string, any>;
	businessKey?: string;
	caller?: Caller;
	idleTimeout?: number;
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
	delete(type: string | StorageType, key: string, options?: any): Promise<any | undefined>;
	query<T>(type: string | StorageType, qs: StorageQuery, options?: any): Promise<{ records: T[]; [x: string]: any }>;
  }

  /**
   * Calling process
   */
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
	/** Deployment name */
	name: string;
	state?: BpmnEngineRunningStatus;
	activityStatus?: ActivityStatus;
	sequenceNumber?: number;
	postponed?: postponed[];
	caller?: Caller;
	expireAt?: Date;
	/** Output from process */
	result?: Record<string, any>;
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
	/**
	 * Bpmn Engine Middleware
	 * 
	 */
	export function BpmnEngineMiddleware(options: BpmnMiddlewareOptions, engines?: Engines): void;
	export class BpmnEngineMiddleware {
		/**
		 * Bpmn Engine Middleware
		 * 
		 */
		constructor(options: BpmnMiddlewareOptions, engines?: Engines);
		name: string;
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
		broker: Broker;
		/**
		 * Bound init
		 */
		_init: import("connect").NextHandleFunction;
		/**
		 * Bound addEngineLocals
		 */
		_addEngineLocals: import("connect").NextHandleFunction;
		init(req: import("connect").IncomingMessage, res: import("http").ServerResponse, next: import("connect").NextFunction): void;
		_bpmnEngineListener: BpmnPrefixListener;
		/**
		 * Start deployment request pipeline
		 * @param fn start request handler
		 * */
		start(fn?: import("express").RequestHandler): import("express").RequestHandler<StartDeployment, {
			id: string;
		}, StartDeploymentOptions, ExecuteOptions>[];
		/**
		 * Resume engine request pipeline
		 * @param fn resume request handler
		 * */
		resume(fn?: import("express").RequestHandler): import("express").RequestHandler<TokenParameter, ReturnType<Engines["getEngineStatusByToken"]>, any, ExecuteOptions>[];
		/**
		 * Signal activity request pipeline
		 * */
		signal(): import("express").RequestHandler<TokenParameter, ReturnType<Engines["getEngineStatusByToken"]>, SignalBody, ExecuteOptions>[];
		/**
		 * Cancel activity request pipeline
		 * */
		cancel(): import("express").RequestHandler<TokenParameter, ReturnType<Engines["getEngineStatusByToken"]>, SignalBody, ExecuteOptions>[];
		/**
		 * Fail activity request pipeline
		 * */
		fail(): import("express").RequestHandler<TokenParameter, ReturnType<Engines["getEngineStatusByToken"]>, SignalBody, ExecuteOptions>[];
		/**
		 * Pre start BPMN engine execution middleware
		 * */
		preStart(): import("connect").NextHandleFunction;
		preResume(req: import("connect").IncomingMessage, res: import("http").ServerResponse, next: import("connect").NextFunction): void;
		/**
		 * Add BPMN engine execution middleware response locals
		 * */
		addResponseLocals(): import("connect").NextHandleFunction[];
		addEngineLocals(req: import("connect").IncomingMessage, res: import("http").ServerResponse, next: import("connect").NextFunction): void;
		/**
		 * Get package version
		 * */
		getVersion(_req: import("express").Request, res: import("express").Response<any, {
			version: string;
		}>): import("express").Response<any, {
			version: string;
		}>;
		/**
		 * Get deployment/package name
		 * */
		getDeployment(_req: import("express").Request, res: import("express").Response<{
			name: string;
		}>): import("express").Response<{
			name: string;
		}, Record<string, any>>;
		/**
		 * Create deployment
		 * */
		create(req: import("express").Request, res: import("express").Response<CreateDeploymentResponseBody, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<CreateDeploymentResponseBody, BpmnMiddlewareResponseLocals>>;
		/**
		 * Run deployment
		 * */
		runDeployment(_req: import("express").Request<StartDeployment, StartDeploymentResult, any, ExecuteOptions>, res: import("express").Response<StartDeploymentResult, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<StartDeploymentResult, BpmnMiddlewareResponseLocals>>;
		/**
		 * Start deployment
		 * */
		getScript(_req: import("express").Request<StartDeployment>, res: import("express").Response<string, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<string, BpmnMiddlewareResponseLocals>>;
		/**
		 * Start deployment
		 * */
		getDeploymentTimers(_req: import("express").Request<StartDeployment>, res: import("express").Response<{
			timers: ParsedTimerResult[];
		}>, next: import("express").NextFunction): Promise<import("express").Response<{
			timers: ParsedTimerResult[];
		}, Record<string, any>>>;
		/**
		 * Get running engines
		 * */
		getRunning(req: import("express").Request<StorageQuery>, res: import("express").Response<Awaited<ReturnType<Engines["getRunning"]>>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineState[], BpmnMiddlewareResponseLocals>>;
		/**
		 * Get engine status by token
		 * */
		getStatusByToken(req: import("express").Request<TokenParameter>, res: import("express").Response<Awaited<ReturnType<Engines["getStatusByToken"]>>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineStatus, BpmnMiddlewareResponseLocals>>;
		/**
		 * Get engine activity status
		 * */
		getActivityStatus(req: import("express").Request<{
			token: string;
			activityId: string;
		}>, res: import("express").Response<PostponedElement, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<void>;
		/**
		 * Signal activity
		 * */
		signalActivity(req: import("express").Request<TokenParameter, SignalBody, ExecuteOptions>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineStatus, BpmnMiddlewareResponseLocals>>;
		/**
		 * Cancel activity
		 * */
		cancelActivity(req: import("express").Request<TokenParameter, SignalBody>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineStatus, BpmnMiddlewareResponseLocals>>;
		/**
		 * Fail activity
		 * */
		failActivity(req: import("express").Request<TokenParameter, SignalBody>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineStatus, BpmnMiddlewareResponseLocals>>;
		/**
		 * Resume engine by token
		 * */
		resumeByToken(_req: import("express").Request<TokenParameter, any, ExecuteOptions>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineStatus, BpmnMiddlewareResponseLocals>>;
		/**
		 * Get engine state by token
		 * */
		getStateByToken(req: import("express").Request<TokenParameter>, res: import("express").Response<Awaited<ReturnType<Engines["getStateByToken"]>>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineState, BpmnMiddlewareResponseLocals>>;
		/**
		 * Delete engine by token
		 * */
		deleteStateByToken(req: import("express").Request<TokenParameter, void>, res: import("express").Response<void, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<void, BpmnMiddlewareResponseLocals>>;
		/**
		 * Stop all running engines
		 * */
		internalStopAll(_: import("express").Request, res: import("express").Response): import("express").Response<any, Record<string, any>>;
		/**
		 * Stop engine by token
		 * */
		internalStopByToken(req: import("express").Request, res: import("express").Response): import("express").Response<any, Record<string, any>>;
		/**
		 * Internal create engine middleware
		 * */
		createEngine(req: import("express").Request<StartDeployment, void, StartDeploymentOptions>, res: import("express").Response<void, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<void>;
		
		startAndTrackEngine(fn: import("express").RequestHandler): (req: import("express").Request<StartDeployment, void, StartDeploymentOptions>, res: import("express").Response<void, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction) => Promise<void>;
		
		resumeAndTrackEngine(fn: import("express").RequestHandler): (req: import("express").Request<StartDeployment, void, ExecuteOptions>, res: import("express").Response<void, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction) => Promise<void>;
		_validateLocals(req: import("connect").IncomingMessage, res: import("http").ServerResponse, next: import("connect").NextFunction): void;
		/**
		 * Internal get engine run options from query
		 * */
		_parseQueryToEngineOptions(req: import("express").Request<any, any, ExecuteOptions>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): void;
		/**
		 * Start process by call activity
		 * */
		_startProcessByCallActivity(callActivityMessage: import("smqp").Message): Promise<MiddlewareEngine | {
			id: string;
		}>;
		/**
		 * Internal start deployment
		 * @returns Started with id token
		 */
		_startDeployment(deploymentName: string, options: import("bpmn-engine").BpmnEngineOptions): Promise<{
			id: string;
		}>;
		/**
		 * Cancel process by call activity
		 * */
		_cancelProcessByCallActivity(callActivityMessage: import("smqp").Message): Promise<void>;
		/**
		 * Post process engine definition run
		 * */
		_postProcessDefinitionRun(definitionEndMessage: import("smqp").MessageMessage): Promise<void>;
		[kInitilialized]: boolean;
	}
	/**
	 * Middleware response locals
	 */
	type BpmnMiddlewareResponseLocals = {
		/**
		 * - Middleware name
		 */
		middlewareName: string;
		/**
		 * - Engine factory
		 */
		engines: Engines;
		/**
		 * - Storage adapter
		 */
		adapter: IStorageAdapter;
		/**
		 * - Middleware broker
		 */
		broker: Broker;
		/**
		 * - BPMN engine listener
		 */
		listener: BpmnPrefixListener;
		/**
		 * - BPMN engine execution token
		 */
		token?: string;
		/**
		 * - BPMN engine instance
		 */
		engine?: MiddlewareEngine;
		/**
		 * - BPMN engine execution options
		 */
		executeOptions?: ExecuteOptions;
	};
	/**
	 * Start deployment params
	 */
	type StartDeployment = {
		/**
		 * - Deployment name
		 */
		deploymentName: string;
	};
	/**
	 * Start deployment result
	 */
	type StartDeploymentResult = {
		/**
		 * - engine run token
		 */
		id: string;
		/**
		 * - engine.environment.output as result
		 */
		result?: any;
	};
	/**
	 * Token params
	 */
	type TokenParameter = {
		/**
		 * - BPMN engine execution token
		 */
		token: string;
	};
	/**
	 * Create deployment result
	 */
	type CreateDeploymentResponseBody = {
		/**
		 * - Deployment name
		 */
		id: string;
		/**
		 * - Deployed at date
		 */
		deploymentTime: Date;
		/**
		 * - Deployed process definitions
		 */
		deployedProcessDefinitions: any;
	};
	/**
	 * Bpmn prefix listener
	 * @param app Express app
	 */
	function BpmnPrefixListener(app: import("express").Application): void;
	class BpmnPrefixListener {
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
	const kInitilialized: unique symbol;
	export const STORAGE_TYPE_DEPLOYMENT: "deployment";
	export const STORAGE_TYPE_STATE: "state";
	export const STORAGE_TYPE_FILE: "file";
	export const DEFAULT_IDLE_TIMER: 120000;
	export const SAVE_STATE_ROUTINGKEY: "activity.state.save";
	export const ENABLE_SAVE_STATE_ROUTINGKEY: "activity.state.save.enable";
	export const DISABLE_SAVE_STATE_ROUTINGKEY: "activity.state.save.disable";
	export const ERR_STORAGE_KEY_NOT_FOUND: "ERR_BPMN_MIDDLEWARE_STORAGE_KEY_NOT_FOUND";
	export const MIDDLEWARE_DEFAULT_EXCHANGE: "default";
	/**
	 * Engines class
	 * */
	export function Engines(options: BpmnMiddlewareOptions): void;
	export class Engines {
		/**
		 * Engines class
		 * */
		constructor(options: BpmnMiddlewareOptions);
		name: string;
		
		broker: import("smqp").Broker;
		engineOptions: import("bpmn-engine").BpmnEngineOptions;
		idleTimeout: number;
		adapter: IStorageAdapter;
		
		engineCache: LRUCache<string, MiddlewareEngine, unknown>;
		autosaveEngineState: boolean;
		Scripts: (adapter: IStorageAdapter, deploymentName: string, businessKey?: string) => import("bpmn-elements").IScripts;
		Services: (this: import("bpmn-elements").Environment, adapter: IStorageAdapter, deploymentName: string, businessKey?: string) => Record<string, CallableFunction>;
		
		__onStateMessage: (routingKey: string, message: import("smqp").Message, engine: MiddlewareEngine) => Promise<void>;
		get running(): MiddlewareEngine[];
		/**
		 * Create and execute engine from options
		 * */
		execute(executeOptions: MiddlewareEngineOptions): Promise<MiddlewareEngine>;
		/**
		 * Run prepared engine
		 * 
		 */
		run(engine: MiddlewareEngine, listener?: import("bpmn-engine").IListenerEmitter, callback?: (err: Error, engine: import("bpmn-engine").Execution) => void): Promise<MiddlewareEngine>;
		/**
		 * Resume engine execution
		 * @param callback resume run completed callback
		 * */
		resume(token: string, listener?: import("bpmn-engine").IListenerEmitter, options?: ExecuteOptions, callback?: (err: Error, engine: import("bpmn-engine").Execution) => void): Promise<MiddlewareEngine>;
		/**
		 * Signal activity
		 * 
		 */
		resumeAndSignalActivity(token: string, listener: import("bpmn-engine").IListenerEmitter, body: SignalBody, options?: ExecuteOptions, callback?: (err: Error, engine: import("bpmn-engine").Execution) => void): Promise<MiddlewareEngine>;
		/**
		 * Cancel activity
		 * 
		 */
		resumeAndCancelActivity(token: string, listener: import("bpmn-engine").IListenerEmitter, body: SignalBody, options?: ExecuteOptions): Promise<MiddlewareEngine>;
		/**
		 * Resume and fail activity
		 * 
		 */
		resumeAndFailActivity(token: string, listener: import("bpmn-engine").IListenerEmitter, body: SignalBody, options?: ExecuteOptions): Promise<MiddlewareEngine>;
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
		 * Get running engines by querying storage
		 * */
		getRunning(query?: any): Promise<MiddlewareEngineState[]>;
		/**
		 * Discards engine by token
		 * 
		 */
		discardByToken(token?: string): Promise<void>;
		/**
		 * Get running engine by token
		 * */
		getByToken(token: string): MiddlewareEngine | undefined;
		/**
		 * Delete engine state and stop engine by token
		 * 
		 */
		deleteByToken(token: string, options?: any): Promise<any>;
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
		 * @param options adapter store options
		 */
		saveEngineState(engine: MiddlewareEngine, ifExists?: boolean, options?: any): Promise<void>;
		/**
		 * @internal
		 * Internal setup engine listeners
		 * */
		_setupEngine(engine: MiddlewareEngine): void;
		/**
		 * Internal on state message
		 * */
		_onStateMessage(routingKey: string, message: import("smqp").Message, engine: MiddlewareEngine): Promise<void>;
		/**
		 * Internal teardown engine, remove listeners and stuff
		 * */
		_teardownEngine(engine: MiddlewareEngine): void;
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
		 * @internal
		 * Internal query state
		 * */
		_queryState(qs: any): any[];
	}
	export class HttpError extends Error {
		/**
		 * Error with status code
		 * @param message Error message
		 * @param statusCode HTTP status code
		 * @param code Error code
		 */
		constructor(message: string, statusCode: number, code?: string);
		statusCode: number;
		code: string;
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
	export class MiddlewareEngine extends Engine {
		
		constructor(token: string, options?: MiddlewareEngineOptions);
		
		options: MiddlewareEngineOptions;
		/**
		 * Execution idle timer
		 * */
		idleTimer: import("bpmn-elements").Timer | null | void;
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
		 * @param customHandler optional idle timeout handler function
		 * @param delay optional delay
		 */
		startIdleTimer(customHandler?: (engine: MiddlewareEngine, delay: number) => void, delay?: number): void;
		
		_idleTimeoutHandler(delay: number): number | Promise<void>;
		
		_getCurrentStatus(): {
			expireAt: Date;
			name: string;
			token: string;
			activityStatus: import("bpmn-elements").ActivityStatus;
		};
		/**
		 * Engine execution token
		 * */
		[kToken]: string;
	}
	const kToken: unique symbol;

	export {};
}

//# sourceMappingURL=index.d.ts.map
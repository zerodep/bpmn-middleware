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
	engineCache?: LRUCache<string, any>;
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

  interface MiddlewareEngineOptions extends BpmnEngineOptions {
	token?: string;
	caller?: Caller;
	idleTimeout?: number;
	sequenceNumber?: number;
	expireAt?: Date;
	businessKey?: string;
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
	delete(type: string | StorageType, key: string): Promise<any>;
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

  interface ResumeOptions {
	autosaveEngineState?: boolean;
	[x: string]: any;
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
		broker: import("smqp").Broker;
		/**
		 * Bound init
		 */
		_init: (req: import("express").Request, _: import("express").Response, next: import("express").NextFunction) => void;
		/**
		 * Bound addEngineLocals
		 */
		_addEngineLocals: (_req: import("express").Request, res: import("express").Response<any, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction) => void;
		/**
		 * Bound createEngine
		 */
		_createEngine: (req: import("express").Request<StartDeployment, void, StartDeploymentOptions>, res: import("express").Response<void, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction) => Promise<void>;
		/**
		 * Bound validate locals
		 */
		__validateLocals: (_req: import("express").Request, res: import("express").Response<void, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction) => void;
		/**
		 * Bound resume options
		 */
		__resumeOptions: (req: import("express").Request<any, any, ResumeQuery>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction) => void;
		/**
		 * Initialize middleware
		 * */
		init(req: import("express").Request, _: import("express").Response, next: import("express").NextFunction): void;
		_bpmnEngineListener: BpmnPrefixListener;
		/**
		 * Start deployment request pipeline
		 * */
		start(): import("express").RequestHandler<StartDeployment, {
			id: string;
		}, StartDeploymentOptions>[];
		/**
		 * Resume engine request pipeline
		 * */
		resume(): import("express").RequestHandler<TokenParameter, ReturnType<Engines["getEngineStatusByToken"]>, any, ResumeQuery>[];
		/**
		 * Signal activity request pipeline
		 * */
		signal(): import("express").RequestHandler<TokenParameter, ReturnType<Engines["getEngineStatusByToken"]>, SignalBody, ResumeQuery>[];
		/**
		 * Cancel activity request pipeline
		 * */
		cancel(): import("express").RequestHandler<TokenParameter, ReturnType<Engines["getEngineStatusByToken"]>, SignalBody, ResumeQuery>[];
		/**
		 * Add BPMN engine execution middleware response locals
		 * */
		addResponseLocals(): import("express").RequestHandler[];
		/**
		 * Add middleware response locals
		 * */
		addEngineLocals(_req: import("express").Request, res: import("express").Response<any, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): void;
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
		 * Pre start BPMN engine execution middleware
		 * */
		preStart(): import("express").RequestHandler[];
		/**
		 * Run deployment
		 * */
		runDeployment(_req: import("express").Request<StartDeployment, {
			id: string;
		}>, res: import("express").Response<{
			id: string;
		}, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<{
			id: string;
		}, BpmnMiddlewareResponseLocals>>;
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
		signalActivity(req: import("express").Request<TokenParameter, SignalBody>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineStatus, BpmnMiddlewareResponseLocals>>;
		/**
		 * Cancel activity
		 * */
		cancelActivity(req: import("express").Request<TokenParameter, SignalBody>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineStatus, BpmnMiddlewareResponseLocals>>;
		/**
		 * Fail activity
		 * */
		failActivity(req: import("express").Request<TokenParameter, SignalBody>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineStatus, BpmnMiddlewareResponseLocals>>;
		/**
		 * Pre resume middleware
		 * */
		preResume(): import("express").RequestHandler[];
		/**
		 * Resume engine by token
		 * */
		resumeByToken(req: import("express").Request<TokenParameter>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineStatus, BpmnMiddlewareResponseLocals>>;
		/**
		 * Get engine state by token
		 * */
		getStateByToken(req: import("express").Request<TokenParameter>, res: import("express").Response<Awaited<ReturnType<Engines["getStateByToken"]>>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineState, BpmnMiddlewareResponseLocals>>;
		/**
		 * Delete engine by token
		 * */
		deleteStateByToken(req: import("express").Request<TokenParameter>, res: import("express").Response<void, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<void, BpmnMiddlewareResponseLocals>>;
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
		/**
		 * Internal validate response locals
		 * */
		_validateLocals(_req: import("express").Request, res: import("express").Response<void, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): void;
		/**
		 * Internal get resume options
		 * */
		_resumeOptions(req: import("express").Request<any, any, ResumeQuery>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): void;
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
		 * - Engine factory
		 */
		engines: Engines;
		/**
		 * - Storage adapter
		 */
		adapter: IStorageAdapter;
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
		 * - BPMN engine resume options
		 */
		resumeOptions?: ResumeOptions;
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
	 * Resume query
	 */
	type ResumeQuery = {
		/**
		 * - Autosave engine state
		 */
		autosaveEngineState?: string;
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
		
		engineCache: LRUCache<string, any, unknown>;
		autosaveEngineState: boolean;
		Scripts: (adapter: IStorageAdapter, deploymentName: string, businessKey?: string) => import("bpmn-elements").IScripts;
		Services: (this: import("bpmn-elements").Environment, adapter: IStorageAdapter, deploymentName: string, businessKey?: string) => Record<string, CallableFunction>;
		
		__onStateMessage: (routingKey: string, message: import("smqp").Message, engine: MiddlewareEngine) => Promise<boolean | void>;
		/**
		 * Create and execute engine from options
		 * */
		execute(executeOptions: MiddlewareEngineOptions): Promise<MiddlewareEngine>;
		/**
		 * Run prepared engine
		 * 
		 */
		run(engine: MiddlewareEngine, listener?: import("bpmn-engine").IListenerEmitter): Promise<MiddlewareEngine>;
		/**
		 * Resume engine execution
		 * */
		resume(token: string, listener?: import("bpmn-engine").IListenerEmitter, options?: ResumeOptions): Promise<MiddlewareEngine>;
		/**
		 * Signal activity
		 * 
		 */
		signalActivity(token: string, listener: import("bpmn-engine").IListenerEmitter, body: SignalBody, options?: ResumeOptions): Promise<MiddlewareEngine>;
		/**
		 * Cancel activity
		 * 
		 */
		cancelActivity(token: string, listener: import("bpmn-engine").IListenerEmitter, body: SignalBody, options?: ResumeOptions): Promise<MiddlewareEngine>;
		/**
		 * Fail activity
		 * 
		 */
		failActivity(token: string, listener: import("bpmn-engine").IListenerEmitter, body: SignalBody, options?: ResumeOptions): Promise<MiddlewareEngine>;
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

	export {};
}

//# sourceMappingURL=index.d.ts.map
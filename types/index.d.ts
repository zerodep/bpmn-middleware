declare module 'bpmn-middleware' {
	import type { Engine, BpmnEngineOptions, BpmnEngineRunningStatus } from 'bpmn-engine';
	import type { ActivityStatus } from 'bpmn-elements';
	import type { LRUCache } from 'lru-cache';
	import type { Broker } from 'smqp';
	/// <reference types="node" />
	/// <reference types="moddle-context-serializer" />

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
			typeResolver?: import("moddle-context-serializer").extendFn;
			moddleOptions?: any;
			moddleContext?: import("bpmn-moddle").Definitions;
			listener?: import("events")<[never]>;
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
		_addEngineLocals: (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => void;
		/**
		 * Initiliaze engine
		 * */
		init(req: import('express').Request, _: import('express').Response, next: import('express').NextFunction): void;
		/**
		 * Initiliaze middleware locals
		 * */
		addEngineLocals(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): void;
		/**
		 * Get package version
		 * */
		getVersion(_: import('express').Request, res: import('express').Response): import("express").Response<any, Record<string, any>>;
		/**
		 * Get deployment/package name
		 * */
		getDeployment(_: import('express').Request, res: import('express').Response): import("express").Response<any, Record<string, any>>;
		/**
		 * Create deployment
		 * */
		create(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): Promise<import("express").Response<any, Record<string, any>>>;
		/**
		 * Start deployment
		 * */
		start(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): Promise<import("express").Response<any, Record<string, any>>>;
		/**
		 * Get running engines
		 * */
		getRunning(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): Promise<import("express").Response<any, Record<string, any>>>;
		/**
		 * Get engine status by token
		 * */
		getStatusByToken(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): Promise<import("express").Response<any, Record<string, any>>>;
		/**
		 * Get engine activity status
		 * */
		getActivityStatus(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): Promise<void>;
		/**
		 * Signal activity
		 * */
		signalActivity(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): Promise<import("express").Response<any, Record<string, any>>>;
		/**
		 * Cancel activity
		 * */
		cancelActivity(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): Promise<import("express").Response<any, Record<string, any>>>;
		/**
		 * Fail activity
		 * */
		failActivity(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): Promise<import("express").Response<any, Record<string, any>>>;
		/**
		 * Resume engine by token
		 * */
		resumeByToken(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): Promise<import("express").Response<any, Record<string, any>>>;
		/**
		 * Get engine state by token
		 * */
		getStateByToken(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): Promise<import("express").Response<any, Record<string, any>>>;
		/**
		 * Delete engine by token
		 * */
		deleteStateByToken(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): Promise<import("express").Response<any, Record<string, any>>>;
		/**
		 * Stop all running engines
		 * */
		internalStopAll(_: import('express').Request, res: import('express').Response): import("express").Response<any, Record<string, any>>;
		/**
		 * Stop engine by token
		 * */
		internalStopByToken(req: import('express').Request, res: import('express').Response): import("express").Response<any, Record<string, any>>;
		/**
		 * Internal start deployment
		 * @returns Started with id token
		 */
		_startDeployment(deploymentName: string, options: import('bpmn-engine').BpmnEngineOptions): Promise<{
			id: string;
		}>;
		
		_startProcessByCallActivity(callActivityApi: import('bpmn-elements').Api<import('bpmn-elements').Activity>): Promise<{
			id: string;
		}>;
		
		_cancelProcessByCallActivity(callActivityApi: import('bpmn-elements').Api<import('bpmn-elements').Activity>): Promise<void>;
		/**
		 * Post process engine run
		 * 
		 */
		_postProcessRun(engine: MiddlewareEngine, error?: Error): Promise<void>;
		[kInitilialized]: boolean;
	}
	/**
	 * Bpmn prefix listener
	 * @param app Express app
	 */
	export function BpmnPrefixListener(app: import('express').Application): void;
	export class BpmnPrefixListener {
		/**
		 * Bpmn prefix listener
		 * @param app Express app
		 */
		constructor(app: import('express').Application);
		app: import("express").Application;
		/**
		 * Emit event on Express app
		 * */
		emit(eventName: string, ...args: any[]): boolean;
	}
	export default bpmnEngineMiddleware;
	const kInitilialized: unique symbol;
  enum StorageType {
	State = 'state',
	Deployment = 'deployment',
	File = 'file',
  }

  interface BpmnMiddlewareOptions {
	adapter: IStorageAdapter;
	/** Options passed to each created engine */
	engineOptions?: BpmnEngineOptions;
	/** Executing engines */
	engineCache?: LRUCache<string, any>;
	/** App broker, used for forwarding events from executing engines */
	broker?: Broker;
	/** Engine execution timeout before considered idle, defaults to 120000ms */
	idleTimeout?: number;
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
  }
	export const STORAGE_TYPE_DEPLOYMENT: "deployment";
	export const STORAGE_TYPE_STATE: "state";
	export const STORAGE_TYPE_FILE: "file";
	export const DEFAULT_IDLE_TIMER: 120000;
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
		__onStateMessage: (routingKey: string, message: import('smqp').Message, engine: MiddlewareEngine) => Promise<boolean | void>;
		
		execute(executeOptions: MiddlewareEngineOptions): Promise<MiddlewareEngine>;
		/**
		 * Resume engine execution
		 * */
		resume(token: string, listener?: import('events').EventEmitter): Promise<MiddlewareEngine>;
		/**
		 * Signal activity
		 * */
		signalActivity(token: string, listener: import('events').EventEmitter, body: any): Promise<MiddlewareEngine>;
		/**
		 * Cancel activity
		 * */
		cancelActivity(token: string, listener: import('events').EventEmitter, body: any): Promise<MiddlewareEngine>;
		/**
		 * Fail activity
		 * */
		failActivity(token: string, listener: import('events').EventEmitter, body: any): Promise<MiddlewareEngine>;
		/**
		 * Get postponed activities by token
		 * */
		getPostponed(token: string, listener: import('events').EventEmitter): Promise<{
			executing: {
				[x: string]: any;
				id?: string;
				type?: string;
				executionId?: string;
				parent?: import("bpmn-elements").ElementParent;
			}[];
			id?: string;
			type?: string;
			executionId?: string;
			parent?: import("bpmn-elements").ElementParent;
			token: string;
		}[]>;
		/**
		 * Get engine state by token
		 * */
		getStateByToken(token: string, options: any): Promise<any>;
		/**
		 * Get engine status by token
		 * */
		getStatusByToken(token: string): Promise<any>;
		/**
		 * Get running engines by query
		 * 
		 */
		getRunning(query?: any): Promise<{
			engines: any[];
		}>;
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
		 * Get engine status
		 * */
		_setupEngine(engine: MiddlewareEngine): void;
		/**
		 * Internal on state message
		 * */
		_onStateMessage(routingKey: string, message: import('smqp').Message, engine: MiddlewareEngine): Promise<boolean | void>;
		/**
		 * Internal save engine state
		 * */
		_saveEngineState(engine: MiddlewareEngine): Promise<void>;
		/**
		 * Internal teardown engine, remove listeners and stuff
		 * */
		_teardownEngine(engine: MiddlewareEngine): void;
		/**
		 * Internal get actvity
		 * */
		_getActivityApi(engine: MiddlewareEngine, body: {
			id?: string;
			executionId?: string;
		}): any;
	}
	export class MiddlewareEngine extends Engine {
		
		constructor(token: string, options?: MiddlewareEngineOptions);
		
		options: MiddlewareEngineOptions;
		
		token: string;
		
		idleTimer: import('bpmn-elements').Timer | void;
		engineTimers: import("bpmn-elements").RegisteredTimer;
		get expireAt(): any;
		startIdleTimer(): void;
		_getCurrentStatus(): {
			expireAt: any;
			name: string;
			token: string;
			activityStatus: import("bpmn-elements").ActivityStatus;
		};
	}
	/**
	 * Memory adapter
	 * 
	 */
	export function MemoryAdapter(storage?: import('lru-cache').LRUCache<string, any>): void;
	export class MemoryAdapter {
		/**
		 * Memory adapter
		 * 
		 */
		constructor(storage?: import('lru-cache').LRUCache<string, any>);
		
		storage: import('lru-cache').LRUCache<string, any>;
		/**
		 * Upsert
		 * 
		 */
		upsert(type: string, key: string, value: any, options?: any): Promise<void>;
		/**
		 * Delete
		 * */
		delete(type: string, key: string): Promise<void>;
		/**
		 * Fetch
		 * 
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
}

//# sourceMappingURL=index.d.ts.map
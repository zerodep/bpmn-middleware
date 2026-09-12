declare module 'bpmn-middleware' {
	import type { BpmnEngineOptions, BpmnEngineExecutionState, BpmnEngineRunningStatus, Engine } from 'bpmn-engine';
	import type { ElementMessageContent, IScripts, Environment, ServiceFunction } from 'bpmn-elements';
	import type { Timer as ContextTimer } from 'moddle-context-serializer';
	import type { LRUCache } from 'lru-cache';
	import type { Broker } from 'smqp';
	/**
	 * BPMN 2 Engine middleware
	 * */
	export function bpmnEngineMiddleware(options?: BpmnMiddlewareOptions_1): import("express").Router & {
		engines: Engines;
		middleware: BpmnEngineMiddleware;
	};
	export type BpmnMiddlewareOptions = BpmnMiddlewareOptions_1;
	export type ExecuteOptions = ExecuteOptions_1;
	export type StartDeploymentOptions = StartDeploymentOptions_1;
	export type StartDeploymentResult = StartDeploymentResult_1;
	export type MiddlewareEngineStatus = MiddlewareEngineStatus_1;
	export type MiddlewareEngineState = MiddlewareEngineState_1;
	export type SignalBody = SignalBody_1;
	export type StartDeployment = StartDeployment_1;
	export type TokenParameter = TokenParameter_1;
	export type BpmnMiddlewareResponseLocals = BpmnMiddlewareResponseLocals_1;
  type ActivityStatus = import('bpmn-elements').ActivityStatus;

  enum StorageType {
	State = 'state',
	Deployment = 'deployment',
	File = 'file',
	/** Camunda 8 process definition id mapped to deployment name */
	ProcessDefinition = 'process-definition',
  }

  interface BpmnMiddlewareOptions_1 {
	/** middleware name */
	name?: string;
	/** middleware endpoint base path, defaults to `{*splat}` */
	basePath?: string;
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
	) => Record<string, ServiceFunction> | void;
	/** Max running engines per instance */
	maxRunning?: number;
  }

  interface ExecuteOptions_1 {
	autosaveEngineState?: boolean;
	/** Run until end */
	sync?: boolean;
	/** Idle timeout delay */
	idleTimeout?: number;
	/** Resumed by engine token */
	resumedBy?: string;
	[x: string]: any;
  }

  interface MiddlewareEngineOptions extends BpmnEngineOptions {
	token?: string;
	caller?: Caller;
	idleTimeout?: number;
	sequenceNumber?: number;
	expireAt?: Date;
	businessKey?: string;
	/** Run engine to completed */
	sync?: boolean;
	/** Resumed by engine token */
	resumedBy?: string;
  }

  interface StartDeploymentOptions_1 {
	variables?: Record<string, any>;
	businessKey?: string;
	caller?: Caller;
	idleTimeout?: number;
  }

  interface StartDeploymentResult_1 extends Partial<MiddlewareEngineStatus_1> {
	/** Started deployment token */
	id: string;
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

  interface MiddlewareEngineStatus_1 {
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

  interface MiddlewareEngineState_1 extends MiddlewareEngineStatus_1 {
	engine?: BpmnEngineExecutionState;
  }

  interface PostponedElement extends ElementMessageContent {
	token: string;
	/**
	 * Activity executions, e.g. executing multi-instance tasks or event definitions
	 */
	executing?: ElementMessageContent[];
  }

  interface SignalBody_1 {
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
   * Result of `GET /<basePath>/running` — running engines listing returned by
   * `Engines.prototype.getRunning`. `engines` carries the matched records;
   * adapter-supplied paging/cursor fields flow through the index signature.
   */
  interface RunningEngines {
	engines: MiddlewareEngineState_1[];
	[x: string]: any;
  }

  /**
   * Multipart form payload accepted by `POST /<basePath>/deployment/create`.
   * `multer({ storage }).any()` means file fields are accepted under arbitrary
   * names; `file` here is illustrative.
   */
  interface CreateDeploymentForm {
	'deployment-name': string;
	'deployment-source'?: string;
	file?: import('@aller/express-swagger').Binary;
  }

  /**
   * Camunda 8 REST API v2 topology response, doubles as Camunda Modeler connection check and protocol probe
   */
  interface Camunda8Topology {
	gatewayVersion: string;
	clusterSize: number;
	partitionsCount: number;
	replicationFactor: number;
	brokers: any[];
  }

  /**
   * Multipart form payload accepted by `POST /<basePath>/v2/deployments`,
   * BPMN, DMN, and form resources are passed as repeated `resources` file parts
   */
  interface Camunda8DeploymentsForm {
	resources: import('@aller/express-swagger').Binary;
	tenantId?: string;
  }

  /**
   * Deployed Camunda 8 process definition, process definition key is the middleware deployment name
   */
  interface Camunda8ProcessDefinition {
	processDefinitionId: string;
	processDefinitionKey: string;
	processDefinitionVersion: number;
	resourceName: string;
	tenantId: string;
  }

  /**
   * Response body of `POST /<basePath>/v2/deployments`, deployment key is the middleware deployment name
   */
  interface Camunda8DeploymentsResponse {
	deploymentKey: string;
	tenantId: string;
	deployments: { processDefinition: Camunda8ProcessDefinition }[];
  }

  /**
   * Request body of `POST /<basePath>/v2/process-instances`
   */
  interface Camunda8CreateProcessInstanceBody {
	/** BPMN process id of a deployed executable process */
	processDefinitionId?: string;
	/** Alternatively the process definition key, i.e. the middleware deployment name */
	processDefinitionKey?: string;
	variables?: Record<string, any>;
	/** Mapped to engine business key */
	businessId?: string;
	[x: string]: any;
  }

  /**
   * Response body of `POST /<basePath>/v2/process-instances`, process instance key is the middleware engine token
   */
  interface Camunda8ProcessInstance {
	processInstanceKey: string;
	processDefinitionId: string;
	processDefinitionKey: string;
	processDefinitionVersion: number;
	tenantId: string;
  }
	/**
	 * Bpmn Engine Middleware
	 * */
	export function BpmnEngineMiddleware(options: BpmnMiddlewareOptions_1): void;
	export class BpmnEngineMiddleware {
		/**
		 * Bpmn Engine Middleware
		 * */
		constructor(options: BpmnMiddlewareOptions_1);
		name: string;
		adapter: IStorageAdapter;
		broker: Broker;
		engines: Engines;
		engineOptions: {
			[x: string]: any;
			name?: string;
			source?: string | Buffer;
			sourceContext?: import("moddle-context-serializer").SerializableContext;
			elements?: Record<string, any>;
			typeResolver?: import("moddle-context-serializer").TypeResolverExtender;
			extendFn?: import("moddle-context-serializer").ExtendFn;
			moddleOptions?: any;
			moddleContext?: import("bpmn-moddle").Definitions;
			Logger?: (scope: string) => import("bpmn-elements").ILogger;
			scripts?: import("bpmn-elements").IScripts;
			disableDummyScript?: boolean;
			listener?: import("events") | import("bpmn-engine").IListenerEmitter;
			settings?: import("bpmn-elements").EnvironmentSettings;
			variables?: Record<string, any>;
			services?: Record<string, import("bpmn-elements").ServiceFunction>;
			timers?: import("bpmn-elements").ITimers;
			extensions?: Record<string, import("bpmn-elements").Extension>;
			expressions?: import("bpmn-elements").IExpressions;
		};
		init(req: import("connect").IncomingMessage, res: import("http").ServerResponse, next: import("connect").NextFunction): void;
		/**
		 * Start deployment request pipeline
		 * @param fn start request handler
		 * */
		start(fn?: import("express").RequestHandler<StartDeployment_1, any, any, any>): import("express").RequestHandler<StartDeployment_1, StartDeploymentResult_1, StartDeploymentOptions_1, ExecuteOptions_1>[];
		/**
		 * Resume engine request pipeline
		 * @param fn resume request handler
		 * */
		resume(fn?: import("express").RequestHandler<TokenParameter_1, any, any, any>): import("express").RequestHandler<TokenParameter_1, MiddlewareEngineStatus_1, ExecuteOptions_1, ExecuteOptions_1>[];
		/**
		 * Signal activity request pipeline
		 * */
		signal(): import("express").RequestHandler<TokenParameter_1, MiddlewareEngineStatus_1, SignalBody_1, ExecuteOptions_1>[];
		/**
		 * Cancel activity request pipeline
		 * */
		cancel(): import("express").RequestHandler<TokenParameter_1, MiddlewareEngineStatus_1, SignalBody_1, ExecuteOptions_1>[];
		/**
		 * Fail activity request pipeline
		 * */
		fail(): import("express").RequestHandler<TokenParameter_1, MiddlewareEngineStatus_1, SignalBody_1, ExecuteOptions_1>[];
		/**
		 * Camunda 8 start process instance request pipeline
		 * @param fn start request handler
		 * */
		startProcessInstance(fn?: import("express").RequestHandler<StartDeployment_1, any, any, any>): import("express").RequestHandler<StartDeployment_1, Camunda8ProcessInstance, Camunda8CreateProcessInstanceBody, ExecuteOptions_1>[];
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
		getVersion(_req: import("express").Request, res: import("express").Response<{
			version: string;
		}, {
			version: string;
		}>): void;
		/**
		 * Get deployment/package name
		 * */
		getDeployment(_req: import("express").Request, res: import("express").Response<{
			name: string;
		}>): void;
		/**
		 * Create deployment
		 * */
		create(req: import("express").Request<any, CreateDeploymentResponseBody, import("@aller/express-swagger").MultipartBody<CreateDeploymentForm>>, res: import("express").Response<CreateDeploymentResponseBody, BpmnMiddlewareResponseLocals_1>, next: import("express").NextFunction): Promise<void>;
		/**
		 * Get Camunda 8 REST API topology, doubles as Camunda Modeler connection check and protocol probe
		 * */
		getTopology(_req: import("express").Request, res: import("express").Response<Camunda8Topology>): void;
		/**
		 * Create deployment from Camunda 8 modeler multipart resources, deployment is named after the first resource file name
		 * */
		createDeployments(req: import("express").Request<any, Camunda8DeploymentsResponse, import("@aller/express-swagger").MultipartBody<Camunda8DeploymentsForm>>, res: import("express").Response<Camunda8DeploymentsResponse, BpmnMiddlewareResponseLocals_1>, next: import("express").NextFunction): Promise<void>;
		/**
		 * Internal register executable processes so instances can be started by process definition id
		 * @param deploymentName deployment name
		 * @param resourceName deployed BPMN file name
		 * @param tenantId tenant id
		 * */
		_addProcessDefinitions(deploymentName: string, resourceName: string, tenantId: string): Promise<{
			processDefinition: Camunda8ProcessDefinition;
		}[]>;
		/**
		 * Internal map Camunda 8 start process instance body to the start deployment pipeline
		 * */
		_resolveProcessDefinition(req: import("express").Request<StartDeployment_1, Camunda8ProcessInstance, Camunda8CreateProcessInstanceBody>, res: import("express").Response<Camunda8ProcessInstance, BpmnMiddlewareResponseLocals_1>, next: import("express").NextFunction): Promise<void>;
		/**
		 * Started Camunda 8 process instance response, the engine token doubles as process instance key
		 * */
		createdProcessInstance(_req: import("express").Request<StartDeployment_1>, res: import("express").Response<Camunda8ProcessInstance, BpmnMiddlewareResponseLocals_1>): void;
		/**
		 * Redirect Camunda Operate process instance link to engine status, lets Camunda Modeler "Open in Operate" point to the middleware
		 * */
		redirectProcessInstance(req: import("express").Request<{
			processInstanceKey: string;
		}>, res: import("express").Response): void;
		/**
		 * Run deployment
		 * */
		runDeployment(_req: import("express").Request<StartDeployment_1, StartDeploymentResult_1_2, any, ExecuteOptions_1>, res: import("express").Response<StartDeploymentResult_1_2, BpmnMiddlewareResponseLocals_1>, next: import("express").NextFunction): Promise<import("express").Response<StartDeploymentResult_1_2, BpmnMiddlewareResponseLocals_1>>;
		/**
		 * Get deployment scripts
		 * */
		getScript(_req: import("express").Request<StartDeployment_1>, res: import("@aller/express-swagger").ApiResponse<string, 200, "text/javascript">, next: import("express").NextFunction): Promise<void>;
		/**
		 * Get deployment timers
		 * */
		getDeploymentTimers(_req: import("express").Request<StartDeployment_1>, res: import("express").Response<{
			timers: ParsedTimerResult[];
		}>, next: import("express").NextFunction): Promise<void>;
		/**
		 * Get running engines
		 * */
		getRunning(req: import("express").Request<StorageQuery>, res: import("express").Response<RunningEngines, BpmnMiddlewareResponseLocals_1>, next: import("express").NextFunction): Promise<void>;
		/**
		 * Get engine status by token
		 * */
		getStatusByToken(req: import("express").Request<TokenParameter_1>, res: import("express").Response<MiddlewareEngineStatus_1, BpmnMiddlewareResponseLocals_1>, next: import("express").NextFunction): Promise<void>;
		/**
		 * Get engine activity status
		 * */
		getActivityStatus(req: import("express").Request<{
			token: string;
			activityId: string;
		}>, res: import("express").Response<PostponedElement, BpmnMiddlewareResponseLocals_1>, next: import("express").NextFunction): Promise<void>;
		/**
		 * Signal activity
		 * */
		signalActivity(req: import("express").Request<TokenParameter_1, SignalBody_1, ExecuteOptions_1>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals_1>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineStatus_1, BpmnMiddlewareResponseLocals_1>>;
		/**
		 * Cancel activity
		 * */
		cancelActivity(req: import("express").Request<TokenParameter_1, SignalBody_1>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals_1>, next: import("express").NextFunction): Promise<import("express").Response<MiddlewareEngineStatus_1, BpmnMiddlewareResponseLocals_1>>;
		/**
		 * Fail activity
		 * */
		failActivity(req: import("express").Request<TokenParameter_1, SignalBody_1>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals_1>, next: import("express").NextFunction): Promise<void>;
		/**
		 * Resume engine by token
		 * */
		resumeByToken(_req: import("express").Request<TokenParameter_1, any, ExecuteOptions_1>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals_1>, next: import("express").NextFunction): Promise<void>;
		/**
		 * Get engine state by token
		 * */
		getStateByToken(req: import("express").Request<TokenParameter_1>, res: import("express").Response<MiddlewareEngineState_1, BpmnMiddlewareResponseLocals_1>, next: import("express").NextFunction): Promise<void>;
		/**
		 * Delete engine by token
		 * */
		deleteStateByToken(req: import("express").Request<TokenParameter_1>, res: import("express").Response<import("@aller/express-swagger").NoContentResponse, BpmnMiddlewareResponseLocals_1>, next: import("express").NextFunction): Promise<void>;
		/**
		 * Stop all running engines
		 * */
		internalStopAll(_req: import("express").Request, res: import("express").Response<import("@aller/express-swagger").NoContentResponse>): void;
		/**
		 * Stop engine by token
		 * */
		internalStopByToken(req: import("express").Request<{
			token: string;
		}>, res: import("express").Response<import("@aller/express-swagger").NoContentResponse>): void;
		/**
		 * Internal create engine middleware
		 * */
		createEngine(req: import("express").Request<StartDeployment_1, void, StartDeploymentOptions_1>, res: import("express").Response<void, BpmnMiddlewareResponseLocals_1>, next: import("express").NextFunction): Promise<void>;
		
		startAndTrackEngine(fn: import("express").RequestHandler): (req: import("express").Request<StartDeployment_1, void, StartDeploymentOptions_1>, res: import("express").Response<void, BpmnMiddlewareResponseLocals_1>, next: import("express").NextFunction) => Promise<void>;
		
		resumeAndTrackEngine(fn: import("express").RequestHandler): (req: import("express").Request<StartDeployment_1, void, ExecuteOptions_1>, res: import("express").Response<void, BpmnMiddlewareResponseLocals_1>, next: import("express").NextFunction) => Promise<void>;
		_validateLocals(req: import("connect").IncomingMessage, res: import("http").ServerResponse, next: import("connect").NextFunction): void;
		/**
		 * Internal get engine run options from query
		 * */
		_parseQueryToEngineOptions(req: import("express").Request<any, any, ExecuteOptions_1>, res: import("express").Response<MiddlewareEngineStatus_1, BpmnMiddlewareResponseLocals_1>, next: import("express").NextFunction): void;
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
		_postProcessDefinitionRun(definitionEndMessage: import("smqp").Message): Promise<void>;
	}
	/**
	 * Middleware response locals
	 */
	type BpmnMiddlewareResponseLocals_1 = {
		/**
		 * Middleware name
		 */
		middlewareName: string;
		/**
		 * Engine factory
		 */
		engines: Engines;
		/**
		 * Storage adapter
		 */
		adapter: IStorageAdapter;
		/**
		 * Middleware broker
		 */
		broker: Broker;
		/**
		 * BPMN engine listener
		 */
		listener: BpmnPrefixListener;
		/**
		 * BPMN engine execution token
		 */
		token?: string;
		/**
		 * BPMN engine instance
		 */
		engine?: MiddlewareEngine;
		/**
		 * BPMN engine execution options
		 */
		executeOptions?: ExecuteOptions_1;
		/**
		 * Camunda 8 process definition id, set by the start process instance pipeline
		 */
		processDefinitionId?: string;
	};
	/**
	 * Start deployment params
	 */
	type StartDeployment_1 = {
		/**
		 * Deployment name
		 */
		deploymentName: string;
	};
	/**
	 * Start deployment result
	 */
	type StartDeploymentResult_1_2 = {
		/**
		 * engine run token
		 */
		id: string;
		/**
		 * engine.environment.output as result
		 */
		result?: any;
	};
	/**
	 * Token params
	 */
	type TokenParameter_1 = {
		/**
		 * BPMN engine execution token
		 */
		token: string;
	};
	/**
	 * Create deployment result
	 */
	type CreateDeploymentResponseBody = {
		/**
		 * Deployment name
		 */
		id: string;
		/**
		 * Deployed at date
		 */
		deploymentTime: Date;
		/**
		 * Deployed process definitions
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
	export const STORAGE_TYPE_DEPLOYMENT: "deployment";
	export const STORAGE_TYPE_STATE: "state";
	export const STORAGE_TYPE_FILE: "file";
	export const STORAGE_TYPE_PROCESS_DEFINITION: "process-definition";
	export const DEFAULT_TENANT_ID: "<default>";
	export const DEFAULT_IDLE_TIMER: 120000;
	export const SAVE_STATE_ROUTINGKEY: "activity.state.save";
	export const ENABLE_SAVE_STATE_ROUTINGKEY: "activity.state.save.enable";
	export const DISABLE_SAVE_STATE_ROUTINGKEY: "activity.state.save.disable";
	export const MIDDLEWARE_DEFAULT_EXCHANGE: "default";
	export const ERR_STORAGE_KEY_NOT_FOUND: "ERR_BPMN_MIDDLEWARE_STORAGE_KEY_NOT_FOUND";
	export const ERR_COMPLETED: "ERR_BPMN_MIDDLEWARE_COMPLETED";
	/**
	 * Engines class
	 * */
	export function Engines(options: BpmnMiddlewareOptions_1): void;
	export class Engines {
		/**
		 * Engines class
		 * */
		constructor(options: BpmnMiddlewareOptions_1);
		engineOptions: import("bpmn-engine").BpmnEngineOptions;
		idleTimeout: number;
		
		engineCache: LRUCache<string, MiddlewareEngine, unknown>;
		autosaveEngineState: boolean;
		Scripts: (adapter: IStorageAdapter, deploymentName: string, businessKey?: string) => import("bpmn-elements").IScripts;
		Services: (this: import("bpmn-elements").Environment, adapter: IStorageAdapter, deploymentName: string, businessKey?: string) => Record<string, import("bpmn-elements").ServiceFunction> | void;
		get name(): string;
		get broker(): import("smqp").Broker;
		get adapter(): IStorageAdapter;
		get running(): MiddlewareEngine[];
		/**
		 * Clone engines instance
		 * */
		clone(overrideOptions?: Partial<BpmnMiddlewareOptions_1>): Engines;
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
		resume(token: string, listener?: import("bpmn-engine").IListenerEmitter, options?: ExecuteOptions_1, callback?: (err: Error, engine: import("bpmn-engine").Execution) => void): Promise<MiddlewareEngine>;
		/**
		 * Signal activity
		 * 
		 */
		resumeAndSignalActivity(token: string, listener: import("bpmn-engine").IListenerEmitter, body: SignalBody_1, options?: ExecuteOptions_1, callback?: (err: Error, engine: import("bpmn-engine").Execution) => void): Promise<MiddlewareEngine>;
		/**
		 * Cancel activity
		 * 
		 */
		resumeAndCancelActivity(token: string, listener: import("bpmn-engine").IListenerEmitter, body: SignalBody_1, options?: ExecuteOptions_1, callback?: (err: Error, engine: import("bpmn-engine").Execution) => void): Promise<MiddlewareEngine>;
		/**
		 * Resume and fail activity
		 * 
		 */
		resumeAndFailActivity(token: string, listener: import("bpmn-engine").IListenerEmitter, body: SignalBody_1, options?: ExecuteOptions_1): Promise<MiddlewareEngine>;
		/**
		 * Get postponed activities by token
		 * */
		getPostponed(token: string, listener: import("bpmn-engine").IListenerEmitter): Promise<PostponedElement[]>;
		/**
		 * Get engine state by token
		 * @param options adapter fetch options
		 * */
		getStateByToken(token: string, options?: any): Promise<MiddlewareEngineState_1>;
		/**
		 * Get engine status by token
		 * @param options adapter fetch options
		 * */
		getStatusByToken(token: string, options?: any): Promise<MiddlewareEngineStatus_1>;
		/**
		 * Get running engines by querying storage
		 * */
		getRunning(query?: any): Promise<RunningEngines>;
		/**
		 * Discards engine by token
		 * @param options resume options
		 */
		discardByToken(token?: string, listener?: import("bpmn-engine").IListenerEmitter, options?: any): Promise<void>;
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
		getEngineStatusByToken(token: string): MiddlewareEngineStatus_1 | undefined;
		/**
		 * Get engine status
		 * */
		getEngineStatus(engine: MiddlewareEngine): MiddlewareEngineStatus_1;
		/**
		 * Create engine state
		 * */
		createEngineState(engine: MiddlewareEngine): MiddlewareEngineState_1;
		/**
		 * Save engine state
		 * @param ifExists save engine state if existing state
		 * @param options adapter store options
		 */
		saveEngineState(engine: MiddlewareEngine, ifExists?: boolean, options?: any): Promise<void>;
		/**
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
		delete(type: string | StorageType, key: string, options?: any): Promise<any | undefined>;
		/**
		 * Fetch
		 * @param options Passed as fetch options to LRU cache
		 */
		fetch(type: string, key: string, options?: any): Promise<any>;
		query<T>(type: string | StorageType, qs: StorageQuery, options?: any): Promise<{
			records: T[];
			[x: string]: any;
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
		constructor(message: string, code?: string);
		code: string;
	}
	export class MiddlewareEngine extends Engine {
		
		constructor(token: string, options?: MiddlewareEngineOptions);
		/**
		 * Execution idle timer
		 * */
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
	}

	export {};
}

//# sourceMappingURL=index.d.ts.map
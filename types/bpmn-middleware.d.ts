/**
 * Bpmn Engine Middleware
 * @param {import('./interfaces.js').BpmnMiddlewareOptions} options
 */
export function BpmnEngineMiddleware(options: import("./interfaces.js").BpmnMiddlewareOptions): void;
export class BpmnEngineMiddleware {
    /**
     * Bpmn Engine Middleware
     * @param {import('./interfaces.js').BpmnMiddlewareOptions} options
     */
    constructor(options: import("./interfaces.js").BpmnMiddlewareOptions);
    name: string;
    adapter: import("./interfaces.js").IStorageAdapter;
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
        listener?: import("node:events") | import("bpmn-engine").IListenerEmitter;
        settings?: import("bpmn-elements").EnvironmentSettings;
        variables?: Record<string, any>;
        services?: Record<string, import("bpmn-elements").ServiceFunction>;
        timers?: import("bpmn-elements").ITimers;
        extensions?: Record<string, import("bpmn-elements").Extension>;
        expressions?: import("bpmn-elements").IExpressions;
    };
    /**
     * Bound init
     * @internal
     */
    _init: import("connect").NextHandleFunction;
    /**
     * Bound addEngineLocals
     * @internal
     */
    _addEngineLocals: import("connect").NextHandleFunction;
    init(req: import("connect").IncomingMessage, res: import("node:http").ServerResponse, next: import("connect").NextFunction): void;
    /** @internal */
    _bpmnEngineListener: BpmnPrefixListener;
    /**
     * Start deployment request pipeline
     * @param {import('express').RequestHandler<StartDeployment, any, any, any>} [fn] start request handler
     * @returns {import('express').RequestHandler<StartDeployment, import('./interfaces.js').StartDeploymentResult, import('./interfaces.js').StartDeploymentOptions, import('./interfaces.js').ExecuteOptions>[]}
     */
    start(fn?: import("express").RequestHandler<StartDeployment, any, any, any>): import("express").RequestHandler<StartDeployment, import("./interfaces.js").StartDeploymentResult, import("./interfaces.js").StartDeploymentOptions, import("./interfaces.js").ExecuteOptions>[];
    /**
     * Resume engine request pipeline
     * @param {import('express').RequestHandler<TokenParameter, any, any, any>} [fn] resume request handler
     * @returns {import('express').RequestHandler<TokenParameter, import('./interfaces.js').MiddlewareEngineStatus, import('./interfaces.js').ExecuteOptions, import('./interfaces.js').ExecuteOptions>[]}
     */
    resume(fn?: import("express").RequestHandler<TokenParameter, any, any, any>): import("express").RequestHandler<TokenParameter, import("./interfaces.js").MiddlewareEngineStatus, import("./interfaces.js").ExecuteOptions, import("./interfaces.js").ExecuteOptions>[];
    /**
     * Signal activity request pipeline
     * @returns {import('express').RequestHandler<TokenParameter, import('./interfaces.js').MiddlewareEngineStatus, import('./interfaces.js').SignalBody, import('./interfaces.js').ExecuteOptions>[]}
     */
    signal(): import("express").RequestHandler<TokenParameter, import("./interfaces.js").MiddlewareEngineStatus, import("./interfaces.js").SignalBody, import("./interfaces.js").ExecuteOptions>[];
    /**
     * Cancel activity request pipeline
     * @returns {import('express').RequestHandler<TokenParameter, import('./interfaces.js').MiddlewareEngineStatus, import('./interfaces.js').SignalBody, import('./interfaces.js').ExecuteOptions>[]}
     */
    cancel(): import("express").RequestHandler<TokenParameter, import("./interfaces.js").MiddlewareEngineStatus, import("./interfaces.js").SignalBody, import("./interfaces.js").ExecuteOptions>[];
    /**
     * Fail activity request pipeline
     * @returns {import('express').RequestHandler<TokenParameter, import('./interfaces.js').MiddlewareEngineStatus, import('./interfaces.js').SignalBody, import('./interfaces.js').ExecuteOptions>[]}
     */
    fail(): import("express").RequestHandler<TokenParameter, import("./interfaces.js").MiddlewareEngineStatus, import("./interfaces.js").SignalBody, import("./interfaces.js").ExecuteOptions>[];
    /**
     * Camunda 8 start process instance request pipeline
     * @param {import('express').RequestHandler<StartDeployment, any, any, any>} [fn] start request handler
     * @returns {import('express').RequestHandler<StartDeployment, import('./interfaces.js').Camunda8ProcessInstance, import('./interfaces.js').Camunda8CreateProcessInstanceBody, import('./interfaces.js').ExecuteOptions>[]}
     */
    startProcessInstance(fn?: import("express").RequestHandler<StartDeployment, any, any, any>): import("express").RequestHandler<StartDeployment, import("./interfaces.js").Camunda8ProcessInstance, import("./interfaces.js").Camunda8CreateProcessInstanceBody, import("./interfaces.js").ExecuteOptions>[];
    /**
     * Pre start BPMN engine execution middleware
     * @returns {import('connect').NextHandleFunction}
     */
    preStart(): import("connect").NextHandleFunction;
    preResume(req: import("connect").IncomingMessage, res: import("node:http").ServerResponse, next: import("connect").NextFunction): void;
    /**
     * Add BPMN engine execution middleware response locals
     * @returns {import('connect').NextHandleFunction[]}
     */
    addResponseLocals(): import("connect").NextHandleFunction[];
    addEngineLocals(req: import("connect").IncomingMessage, res: import("node:http").ServerResponse, next: import("connect").NextFunction): void;
    /**
     * Get package version
     * @param {import('express').Request} _req
     * @param {import('express').Response<{version:string}, {version:string}>} res
     */
    getVersion(_req: import("express").Request, res: import("express").Response<{
        version: string;
    }, {
        version: string;
    }>): void;
    /**
     * Get deployment/package name
     * @param {import('express').Request} _req
     * @param {import('express').Response<{name:string}>} res
     */
    getDeployment(_req: import("express").Request, res: import("express").Response<{
        name: string;
    }>): void;
    /**
     * Create deployment
     * @param {import('express').Request<any, CreateDeploymentResponseBody, import('@aller/express-swagger').MultipartBody<import('./interfaces.js').CreateDeploymentForm>>} req
     * @param {import('express').Response<CreateDeploymentResponseBody, BpmnMiddlewareResponseLocals>} res
     * @param {import('express').NextFunction} next
     */
    create(req: import("express").Request<any, CreateDeploymentResponseBody, import("@aller/express-swagger").MultipartBody<import("./interfaces.js").CreateDeploymentForm>>, res: import("express").Response<CreateDeploymentResponseBody, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<void>;
    /**
     * Get Camunda 8 REST API topology, doubles as Camunda Modeler connection check and protocol probe
     * @param {import('express').Request} _req
     * @param {import('express').Response<import('./interfaces.js').Camunda8Topology>} res
     */
    getTopology(_req: import("express").Request, res: import("express").Response<import("./interfaces.js").Camunda8Topology>): void;
    /**
     * Create deployment from Camunda 8 modeler multipart resources, deployment is named after the first resource file name
     * @param {import('express').Request<any, import('./interfaces.js').Camunda8DeploymentsResponse, import('@aller/express-swagger').MultipartBody<import('./interfaces.js').Camunda8DeploymentsForm>>} req
     * @param {import('express').Response<import('./interfaces.js').Camunda8DeploymentsResponse, BpmnMiddlewareResponseLocals>} res
     * @param {import('express').NextFunction} next
     */
    createDeployments(req: import("express").Request<any, import("./interfaces.js").Camunda8DeploymentsResponse, import("@aller/express-swagger").MultipartBody<import("./interfaces.js").Camunda8DeploymentsForm>>, res: import("express").Response<import("./interfaces.js").Camunda8DeploymentsResponse, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<void>;
    /**
     * Internal register executable processes so instances can be started by process definition id
     * @internal
     * @param {string} deploymentName deployment name
     * @param {string} resourceName deployed BPMN file name
     * @param {string} tenantId tenant id
     * @returns {Promise<{processDefinition: import('./interfaces.js').Camunda8ProcessDefinition}[]>}
     */
    _addProcessDefinitions(deploymentName: string, resourceName: string, tenantId: string): Promise<{
        processDefinition: import("./interfaces.js").Camunda8ProcessDefinition;
    }[]>;
    /**
     * Internal map Camunda 8 start process instance body to the start deployment pipeline
     * @internal
     * @param {import('express').Request<StartDeployment, import('./interfaces.js').Camunda8ProcessInstance, import('./interfaces.js').Camunda8CreateProcessInstanceBody>} req
     * @param {import('express').Response<import('./interfaces.js').Camunda8ProcessInstance, BpmnMiddlewareResponseLocals>} res
     * @param {import('express').NextFunction} next
     */
    _resolveProcessDefinition(req: import("express").Request<StartDeployment, import("./interfaces.js").Camunda8ProcessInstance, import("./interfaces.js").Camunda8CreateProcessInstanceBody>, res: import("express").Response<import("./interfaces.js").Camunda8ProcessInstance, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<void>;
    /**
     * Started Camunda 8 process instance response, the engine token doubles as process instance key
     * @param {import('express').Request<StartDeployment>} _req
     * @param {import('express').Response<import('./interfaces.js').Camunda8ProcessInstance, BpmnMiddlewareResponseLocals>} res
     */
    createdProcessInstance(_req: import("express").Request<StartDeployment>, res: import("express").Response<import("./interfaces.js").Camunda8ProcessInstance, BpmnMiddlewareResponseLocals>): void;
    /**
     * Redirect Camunda Operate process instance link to engine status, lets Camunda Modeler "Open in Operate" point to the middleware
     * @param {import('express').Request<{processInstanceKey: string}>} req
     * @param {import('express').Response} res
     */
    redirectProcessInstance(req: import("express").Request<{
        processInstanceKey: string;
    }>, res: import("express").Response): void;
    /**
     * Run deployment
     * @param {import('express').Request<StartDeployment, StartDeploymentResult, any, import('./interfaces.js').ExecuteOptions>} _req
     * @param {import('express').Response<StartDeploymentResult, BpmnMiddlewareResponseLocals>} res
     * @param {import('express').NextFunction} next
     */
    runDeployment(_req: import("express").Request<StartDeployment, StartDeploymentResult, any, import("./interfaces.js").ExecuteOptions>, res: import("express").Response<StartDeploymentResult, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<StartDeploymentResult, BpmnMiddlewareResponseLocals>>;
    /**
     * Get deployment scripts
     * @param {import('express').Request<StartDeployment>} _req
     * @param {import('@aller/express-swagger').ApiResponse<string, 200, 'text/javascript'>} res
     * @param {import('express').NextFunction} next
     */
    getScript(_req: import("express").Request<StartDeployment>, res: import("@aller/express-swagger").ApiResponse<string, 200, "text/javascript">, next: import("express").NextFunction): Promise<void>;
    /**
     * Get deployment timers
     * @param {import('express').Request<StartDeployment>} _req
     * @param {import('express').Response<{timers:import('./interfaces.js').ParsedTimerResult[]}>} res
     * @param {import('express').NextFunction} next
     */
    getDeploymentTimers(_req: import("express").Request<StartDeployment>, res: import("express").Response<{
        timers: import("./interfaces.js").ParsedTimerResult[];
    }>, next: import("express").NextFunction): Promise<void>;
    /**
     * Get running engines
     * @param {import('express').Request<import('./interfaces.js').StorageQuery>} req
     * @param {import('express').Response<import('./interfaces.js').RunningEngines, BpmnMiddlewareResponseLocals>} res
     * @param {import('express').NextFunction} next
     */
    getRunning(req: import("express").Request<import("./interfaces.js").StorageQuery>, res: import("express").Response<import("./interfaces.js").RunningEngines, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<void>;
    /**
     * Get engine status by token
     * @param {import('express').Request<TokenParameter>} req
     * @param {import('express').Response<import('./interfaces.js').MiddlewareEngineStatus, BpmnMiddlewareResponseLocals>} res
     * @param {import('express').NextFunction} next
     */
    getStatusByToken(req: import("express").Request<TokenParameter>, res: import("express").Response<import("./interfaces.js").MiddlewareEngineStatus, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<void>;
    /**
     * Get engine activity status
     * @param {import('express').Request<{token:string;activityId:string}>} req
     * @param {import('express').Response<import('./interfaces.js').PostponedElement, BpmnMiddlewareResponseLocals>} res
     * @param {import('express').NextFunction} next
     */
    getActivityStatus(req: import("express").Request<{
        token: string;
        activityId: string;
    }>, res: import("express").Response<import("./interfaces.js").PostponedElement, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<void>;
    /**
     * Signal activity
     * @param {import('express').Request<TokenParameter, import('./interfaces.js').SignalBody, import('./interfaces.js').ExecuteOptions>} req
     * @param {import('express').Response<ReturnType<Engines['getEngineStatusByToken']>, BpmnMiddlewareResponseLocals>} res
     * @param {import('express').NextFunction} next
     */
    signalActivity(req: import("express").Request<TokenParameter, import("./interfaces.js").SignalBody, import("./interfaces.js").ExecuteOptions>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<import("./interfaces.js").MiddlewareEngineStatus, BpmnMiddlewareResponseLocals>>;
    /**
     * Cancel activity
     * @param {import('express').Request<TokenParameter, import('./interfaces.js').SignalBody>} req
     * @param {import('express').Response<ReturnType<Engines['getEngineStatusByToken']>, BpmnMiddlewareResponseLocals>} res
     * @param {import('express').NextFunction} next
     */
    cancelActivity(req: import("express").Request<TokenParameter, import("./interfaces.js").SignalBody>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<import("express").Response<import("./interfaces.js").MiddlewareEngineStatus, BpmnMiddlewareResponseLocals>>;
    /**
     * Fail activity
     * @param {import('express').Request<TokenParameter, import('./interfaces.js').SignalBody>} req
     * @param {import('express').Response<ReturnType<Engines['getEngineStatusByToken']>, BpmnMiddlewareResponseLocals>} res
     * @param {import('express').NextFunction} next
     */
    failActivity(req: import("express").Request<TokenParameter, import("./interfaces.js").SignalBody>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<void>;
    /**
     * Resume engine by token
     * @param {import('express').Request<TokenParameter, any, import('./interfaces.js').ExecuteOptions>} _req
     * @param {import('express').Response<ReturnType<Engines['getEngineStatusByToken']>, BpmnMiddlewareResponseLocals>} res
     * @param {import('express').NextFunction} next
     */
    resumeByToken(_req: import("express").Request<TokenParameter, any, import("./interfaces.js").ExecuteOptions>, res: import("express").Response<ReturnType<Engines["getEngineStatusByToken"]>, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<void>;
    /**
     * Get engine state by token
     * @param {import('express').Request<TokenParameter>} req
     * @param {import('express').Response<import('./interfaces.js').MiddlewareEngineState, BpmnMiddlewareResponseLocals>} res
     * @param {import('express').NextFunction} next
     */
    getStateByToken(req: import("express").Request<TokenParameter>, res: import("express").Response<import("./interfaces.js").MiddlewareEngineState, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<void>;
    /**
     * Delete engine by token
     * @param {import('express').Request<TokenParameter>} req
     * @param {import('express').Response<import('@aller/express-swagger').NoContentResponse, BpmnMiddlewareResponseLocals>} res
     * @param {import('express').NextFunction} next
     */
    deleteStateByToken(req: import("express").Request<TokenParameter>, res: import("express").Response<import("@aller/express-swagger").NoContentResponse, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<void>;
    /**
     * Stop all running engines
     * @internal
     * @param {import('express').Request} _req
     * @param {import('express').Response<import('@aller/express-swagger').NoContentResponse>} res
     */
    internalStopAll(_req: import("express").Request, res: import("express").Response<import("@aller/express-swagger").NoContentResponse>): void;
    /**
     * Stop engine by token
     * @internal
     * @param {import('express').Request<{token:string}>} req
     * @param {import('express').Response<import('@aller/express-swagger').NoContentResponse>} res
     */
    internalStopByToken(req: import("express").Request<{
        token: string;
    }>, res: import("express").Response<import("@aller/express-swagger").NoContentResponse>): void;
    /**
     * Internal create engine middleware
     * @internal
     * @param {import('express').Request<StartDeployment, void, import('./interfaces.js').StartDeploymentOptions>} req
     * @param {import('express').Response<void, BpmnMiddlewareResponseLocals>} res
     * @param {import('express').NextFunction} next
     */
    createEngine(req: import("express").Request<StartDeployment, void, import("./interfaces.js").StartDeploymentOptions>, res: import("express").Response<void, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): Promise<void>;
    /**
     * @internal
     * @param {import('express').RequestHandler} fn
     */
    startAndTrackEngine(fn: import("express").RequestHandler): (req: import("express").Request<StartDeployment, void, import("./interfaces.js").StartDeploymentOptions>, res: import("express").Response<void, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction) => Promise<void>;
    /**
     * @internal
     * @param {import('express').RequestHandler} fn
     */
    resumeAndTrackEngine(fn: import("express").RequestHandler): (req: import("express").Request<StartDeployment, void, import("./interfaces.js").ExecuteOptions>, res: import("express").Response<void, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction) => Promise<void>;
    _validateLocals(req: import("connect").IncomingMessage, res: import("node:http").ServerResponse, next: import("connect").NextFunction): void;
    /**
     * Internal get engine run options from query
     * @internal
     * @param {import('express').Request<any, any, import('./interfaces.js').ExecuteOptions>} req
     * @param {import('express').Response<import('./interfaces.js').MiddlewareEngineStatus, BpmnMiddlewareResponseLocals>} res
     * @param {import('express').NextFunction} next
     */
    _parseQueryToEngineOptions(req: import("express").Request<any, any, import("./interfaces.js").ExecuteOptions>, res: import("express").Response<import("./interfaces.js").MiddlewareEngineStatus, BpmnMiddlewareResponseLocals>, next: import("express").NextFunction): void;
    /**
     * Start process by call activity
     * @internal
     * @param {import('smqp').Message} callActivityMessage
     */
    _startProcessByCallActivity(callActivityMessage: import("smqp").Message): Promise<MiddlewareEngine | {
        id: string;
    }>;
    /**
     * Internal start deployment
     * @internal
     * @param {string} deploymentName
     * @param {import('bpmn-engine').BpmnEngineOptions} options
     * @returns {Promise<{id:string}>} Started with id token
     */
    _startDeployment(deploymentName: string, options: import("bpmn-engine").BpmnEngineOptions): Promise<{
        id: string;
    }>;
    /**
     * Cancel process by call activity
     * @internal
     * @param {import('smqp').Message} callActivityMessage
     */
    _cancelProcessByCallActivity(callActivityMessage: import("smqp").Message): Promise<void>;
    /**
     * Post process engine definition run
     * @internal
     * @param {import('smqp').Message} definitionEndMessage
     */
    _postProcessDefinitionRun(definitionEndMessage: import("smqp").Message): Promise<void>;
    /** @internal */
    [kInitilialized]: boolean;
}
export * from "./constants.js";
/**
 * Middleware response locals
 */
export type BpmnMiddlewareResponseLocals = {
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
    adapter: import("./interfaces.js").IStorageAdapter;
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
    executeOptions?: import("./interfaces.js").ExecuteOptions;
    /**
     * Camunda 8 process definition id, set by the start process instance pipeline
     */
    processDefinitionId?: string;
};
/**
 * Start deployment params
 */
export type StartDeployment = {
    /**
     * Deployment name
     */
    deploymentName: string;
};
/**
 * Start deployment result
 */
export type StartDeploymentResult = {
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
export type TokenParameter = {
    /**
     * BPMN engine execution token
     */
    token: string;
};
/**
 * Create deployment result
 */
export type CreateDeploymentResponseBody = {
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
import { Broker } from 'smqp';
import { Engines } from './engines.js';
/**
 * Bpmn prefix listener
 * @param {import('express').Application} app Express app
 */
declare function BpmnPrefixListener(app: import("express").Application): void;
declare class BpmnPrefixListener {
    /**
     * Bpmn prefix listener
     * @param {import('express').Application} app Express app
     */
    constructor(app: import("express").Application);
    app: import("express").Application;
    /**
     * Emit event on Express app
     * @param {string} eventName
     * @param  {...any} args
     */
    emit(eventName: string, ...args: any[]): boolean;
}
import { MiddlewareEngine } from './middleware-engine.js';
declare const kInitilialized: unique symbol;
import { MemoryAdapter } from './memory-adapter.js';
import { HttpError } from './errors.js';
import { StorageError } from './errors.js';
export { Engines, MemoryAdapter, HttpError, StorageError, MiddlewareEngine };
//# sourceMappingURL=bpmn-middleware.d.ts.map
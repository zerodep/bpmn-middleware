import { Request, Response, NextFunction, Router, Locals } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { Engine, BpmnEngineOptions, BpmnEngineExecutionState, BpmnMessage } from 'bpmn-engine';
import { LRUCache } from 'lru-cache';
import { Broker } from 'smqp';

export enum StorageType {
  State = 'state',
  Deployment = 'deployment',
  File = 'file',
}

export interface StorageQuery {
  /** Fields to exclude */
  exclude?: string[];
  state?: string;
  caller?: Caller;
  [x: string]: any;
}

export interface IStorageAdapter {
  upsert<T>(type: StorageType, key: string, value: T, options?: any): Promise<any>;
  fetch<T>(type: StorageType, key: string, options?: any): Promise<T>;
  delete(type: StorageType, key: string): Promise<any>;
  query<T>(type: StorageType, qs: StorageQuery, options?: any): Promise<{ records: T[], [x: string]: any}>;
}

export class MemoryAdapter implements IStorageAdapter {
  upsert<T>(type: StorageType, key: string, value: T, options?: any): Promise<any>;
  fetch<T>(type: StorageType, key: string, options?: any): Promise<T>;
  delete(type: StorageType, key: string): Promise<any>;
  query<T>(type: StorageType, qs: StorageQuery, options?: any): Promise<{ records: T[], [x: string]: any}>;
}

interface BpmnEngineMiddlewareOptions {
  adapter: IStorageAdapter;
  /** Options passed to each created engine */
  engineOptions?: BpmnEngineOptions;
  /** Executing engines */
  engineCache?: LRUCache<string, MiddlewareEngine>;
  /** App broker, used for forwarding events from executing engines */
  broker?: Broker;
  /** Engine execution timeout before considered idle, defaults to 120000ms */
  idleTimeout?: number;
}

export interface ExecuteOptions extends BpmnEngineOptions {
  token: string;
}

export interface ExecutionInstance {
  id: string;
}

export class MiddlewareEngine extends Engine {
  readonly token: string;
  get expireAt(): Date | null;
  constructor(token: string, options?: BpmnEngineOptions);
  startIdleTimer(): void;
}

export interface EngineStatus {
  token: string;
  name: string;
  state: Engine['state'];
  activityStatus: Engine['activityStatus'];
  sequenceNumber: number;
  postponed: {id: string, executionId: string, type: string}[];
  caller?: Caller;
  expireAt?: Date;
}

export interface EngineState extends EngineStatus {
  engine: BpmnEngineExecutionState;
}

export interface RunningResult {
  engines: EngineStatus[];
  [x: string]: any;
}

export interface PostponedActivity extends BpmnMessage {
  token: string;
  executing?: BpmnMessage[];
}

type ExecutionListener = BpmnEngineOptions['listener'];

export class Engines {
  constructor(options: BpmnEngineMiddlewareOptions);
  adapter: IStorageAdapter;
  engineCache: LRUCache<string, MiddlewareEngine>;
  engineOptions: BpmnEngineOptions;
  idleTimeout?: number | undefined;
  broker?: Broker;
  execute(options: ExecuteOptions): MiddlewareEngine;
  resume(token: string, listener: BpmnEngineOptions['listener']): MiddlewareEngine;
  createEngine(options: ExecuteOptions): MiddlewareEngine;
  getStateByToken(token: string): EngineState | undefined;
  getStatusByToken(token: string): EngineStatus | undefined;
  getRunning(query?: any): RunningResult;
  getPostponed(token: string, listener: BpmnEngineOptions['listener']): PostponedActivity[];
  signalActivity(token: string, listener: BpmnEngineOptions['listener'], body: SignalRequestBody): MiddlewareEngine;
  cancelActivity(token: string, listener: BpmnEngineOptions['listener'], body: SignalRequestBody): MiddlewareEngine;
  failActivity(token: string, listener: BpmnEngineOptions['listener'], body: SignalRequestBody): MiddlewareEngine;
  terminateByToken(token: string): void;
  deleteByToken(token: string): void;
  discardByToken(token: string): void;
}

export interface CreateRequestBody {
  ['deployment-name']: string;
  ['deployment-source']: string;
}

export interface CreateResponseBody {
  id: string;
  deploymentTime: Date;
  deployedProcessDefinitions: { [x: string]: { id: string } };
}

export interface StartRequestBody {
  variables?: Record<string, any>;
  /** Business key, will be added to engine environment variables */
  businessKey?: string;
  /** override idle timeout in milliseconds */
  idleTimeout?: number;
}

export interface Caller {
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

export interface SignalRequestBody {
  id: string;
  executionId?: string;
  message?: any;
  [x: string]: any;
}

interface TokenParam extends ParamsDictionary {
  token: string;
}

interface TokenActivityIdParam extends TokenParam {
  activityId: string;
}

export interface EngineResponseLocals extends Locals {
  engines: Engines;
  adapter: IStorageAdapter;
  listener: ExecutionListener;
}

export class BpmnEngineMiddleware {
  readonly adapter?: IStorageAdapter;
  readonly engines?: Engines;
  readonly engineOptions?: BpmnEngineOptions;
  constructor(options?: { adapter?: IStorageAdapter, engines?: Engines, engineOptions?: BpmnEngineOptions });
  init(req: Request, res: Response, next: NextFunction): void;
  /** Add adapter, engines, and app engine listener to res.locals */
  addEngineLocals(req: Request, res: Response<undefined, EngineResponseLocals>, next: NextFunction): void;
  /** GET (*)?/version */
  getVersion(req: Request, res: Response<{version: string}>, next: NextFunction): Promise<void>;
  /** GET (*)?/deployment */
  getDeployment(req: Request, res: Response<{name: string}>, next: NextFunction): Promise<void>;
  /** POST (*)?/deployment/create */
  create(req: Request<any, CreateRequestBody, CreateResponseBody>, res: Response<CreateResponseBody>, next: NextFunction): Promise<void>;
  /** POST (*)?/process-definition/:deploymentName/start */
  start(req: Request<{deploymentName: string}, StartRequestBody, ExecutionInstance>, res: Response<ExecutionInstance, EngineResponseLocals>, next: NextFunction): Promise<void>;
  /** GET (*)?/running */
  getRunning(req: Request, res: Response<RunningResult>, next: NextFunction): Promise<void>;
  /** GET (*)?/status/:token */
  getStatusByToken(req: Request<TokenParam>, res: Response<EngineStatus>, next: NextFunction): Promise<void>;
  /** GET (*)?/status/:token/:activityId */
  getActivityStatus(req: Request<TokenActivityIdParam>, res: Response<PostponedActivity, EngineResponseLocals>, next: NextFunction): Promise<void>;
  /** POST (*)?/resume/:token */
  resumeByToken(req: Request<TokenParam>, res: Response<EngineStatus, EngineResponseLocals>, next: NextFunction): Promise<void>;
  /** POST (*)?/signal/:token */
  signalActivity(req: Request<TokenParam, EngineStatus, SignalRequestBody>, res: Response<EngineStatus, EngineResponseLocals>, next: NextFunction): Promise<void>;
  /** POST (*)?/cancel/:token */
  cancelActivity(req: Request<TokenParam, EngineStatus, SignalRequestBody>, res: Response<EngineStatus, EngineResponseLocals>, next: NextFunction): Promise<void>;
  /** POST (*)?/fail/:token */
  failActivity(req: Request<TokenParam, EngineStatus, SignalRequestBody>, res: Response<EngineStatus, EngineResponseLocals>, next: NextFunction): Promise<void>;
  /** GET (*)?/state/:token */
  getStateByToken(req: Request<TokenParam>, res: Response<EngineState>, next: NextFunction): Promise<void>;
  /** DELETE (*)?/state/:token */
  deleteStateByToken(req: Request<TokenParam>, res: Response, next: NextFunction): Promise<void>;
  /** DELETE (*)?/internal/stop */
  internalStopAll(req: Request, res: Response, next: NextFunction): void;
  /** DELETE (*)?/internal/stop/:token */
  internalStopByToken(req: Request<TokenParam>, res: Response, next: NextFunction): void;
}

interface MiddlewareReturnType extends Router {
  middleware: BpmnEngineMiddleware;
  engines: Engines;
}

export function bpmnEngineMiddleware(options?: BpmnEngineMiddlewareOptions): MiddlewareReturnType;

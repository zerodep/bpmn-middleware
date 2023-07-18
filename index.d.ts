import { Request, Response, NextFunction, Handler, Router } from 'express'
import { Engine, BpmnEngineOptions, BpmnEngineExecutionState, BpmnMessage } from 'bpmn-engine'
import { LRUCache } from 'lru-cache';
import { Broker } from 'smqp';

export enum StorageType {
  State = 'state',
  Deployment = 'deployment',
  File = 'file',
}

export interface IAdapter {
  upsert<T>(type: StorageType, key: string, value: T, options?: any): Promise<any>;
  fetch<T>(type: StorageType, key: string, options?: any): Promise<T>;
  delete(type: StorageType, key: string): Promise<any>;
  query<T>(type: StorageType, qs: any, options?: any): Promise<{ records: T[], [x: string]: any}>;
}

export class MemoryAdapter implements IAdapter {
  upsert<T>(type: StorageType, key: string, value: T, options?: any): Promise<any>;
  fetch<T>(type: StorageType, key: string, options?: any): Promise<T>;
  delete(type: StorageType, key: string): Promise<any>;
  query<T>(type: StorageType, qs: any, options?: any): Promise<{ records: T[], [x: string]: any}>;
}

interface BpmnEngineMiddlewareOptions {
  adapter: IAdapter;
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

export class Engines {
  constructor(options: BpmnEngineMiddlewareOptions);
  adapter: IAdapter;
  idleTimeout?: number | undefined;
  engineCache: LRUCache<string, MiddlewareEngine>;
  engineOptions: BpmnEngineOptions;
  broker?: Broker;
  execute(options: ExecuteOptions): MiddlewareEngine;
  resume(token: string, listener: BpmnEngineOptions['listener']): MiddlewareEngine;
  createEngine(options: ExecuteOptions): MiddlewareEngine;
  terminateByToken(token: string): void;
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
  token: string;
  deployment: string;
  id: string;
  type: string;
  executionId: string;
}

export interface RunningResponseBody {
  token: string;
  name: string;
  state: Engine['state'];
  activityStatus: Engine['activityStatus'];
  sequenceNumber: number;
  postponed: {id: string, executionId: string, type: string}[];
  caller?: Caller;
  expireAt?: Date;
}

export interface StateResponseBody extends RunningResponseBody {
  engine: BpmnEngineExecutionState;
}

export interface PostponedActivity extends BpmnMessage {
  token: string;
  executing?: BpmnMessage[];
}

export interface SignalRequestBody {
  id: string;
  executionId?: string;
  message?: any;
}

type tokenParam = {
  token: string,
};

type activityIdParam = {
  activityId: string,
};

export class BpmnEngineMiddleware {
  readonly adapter?: IAdapter;
  readonly engines?: Engines;
  readonly engineOptions?: BpmnEngineOptions;
  constructor(options?: { adapter?: IAdapter, engines?: Engines, engineOptions?: BpmnEngineOptions });
  init(req: Request, res: Response, next: NextFunction): void;
  /** GET (*)?/version */
  getVersion(req: Request, res: Response<{version: string}>, next: NextFunction): void;
  /** GET (*)?/deployment */
  getDeployment(req: Request, res: Response<{name: string}>, next: NextFunction): Promise<void>;
  /** POST (*)?/deployment/create */
  create(req: Request<any, CreateRequestBody, CreateResponseBody>, res: Response<CreateResponseBody>, next: NextFunction): Promise<void>;
  /** POST (*)?/process-definition/:deploymentName/start */
  start(req: Request<{deploymentName: string}, StartRequestBody, ExecutionInstance>, res: Response<ExecutionInstance>, next: NextFunction): Promise<void>;
  /** GET (*)?/running */
  getRunning(req: Request, res: Response<{engines: RunningResponseBody[]}>, next: NextFunction): Promise<void>;
  /** GET (*)?/status/:token */
  getStatusByToken(req: Request<tokenParam>, res: Response<RunningResponseBody>, next: NextFunction): Promise<void>;
  /** GET (*)?/status/:token/:activityId */
  getActivityStatus(req: Request<tokenParam & activityIdParam>, res: Response<PostponedActivity>, next: NextFunction): Promise<void>;
  /** POST (*)?/resume/:token */
  resumeByToken(req: Request<tokenParam>, res: Response, next: NextFunction): Promise<void>;
  /** POST (*)?/signal/:token */
  signalActivity(req: Request<tokenParam, SignalRequestBody>, res: Response, next: NextFunction): Promise<void>;
  /** POST (*)?/cancel/:token */
  cancelActivity(req: Request<tokenParam, SignalRequestBody>, res: Response, next: NextFunction): Promise<void>;
  /** POST (*)?/fail/:token */
  failActivity(req: Request<tokenParam, SignalRequestBody>, res: Response<RunningResponseBody>, next: NextFunction): Promise<void>;
  /** GET (*)?/state/:token */
  getStateByToken(req: Request<tokenParam>, res: Response<StateResponseBody>, next: NextFunction): Promise<void>;
  /** DELETE (*)?/state/:token */
  deleteStateByToken(req: Request<tokenParam>, res: Response, next: NextFunction): Promise<void>;
  /** DELETE (*)?/internal/stop */
  internalStopAll(req: Request, res: Response, next: NextFunction): void;
  /** DELETE (*)?/internal/stop/:token */
  internalStopByToken(req: Request<tokenParam>, res: Response, next: NextFunction): void;
}

interface MiddlewareReturnType extends Router {
  engines: Engines;
}

export function bpmnEngineMiddleware(options?: BpmnEngineMiddlewareOptions): MiddlewareReturnType;

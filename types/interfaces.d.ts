import { Request, Response, NextFunction, Router, Locals } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import {
  Engine,
  BpmnEngineOptions,
  BpmnEngineExecutionState,
  BpmnMessage,
  BpmnEngineRunningStatus,
  BpmnEngineDefinitionState,
} from 'bpmn-engine';
import { ActivityStatus } from 'bpmn-elements';
import { LRUCache } from 'lru-cache';
import { Broker } from 'smqp';

export enum StorageType {
  State = 'state',
  Deployment = 'deployment',
  File = 'file',
}

export interface BpmnMiddlewareOptions {
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

export interface MiddlewareEngineOptions extends BpmnEngineOptions {
  token?: string;
  caller?: Caller;
  idleTimeout?: number;
  sequenceNumber?: number;
  expireAt?: Date;
}

export interface StorageQuery {
  /** Fields to exclude */
  exclude?: string[];
  state?: string;
  caller?: Caller;
  [x: string]: any;
}

export interface IStorageAdapter {
  upsert<T>(type: string | StorageType, key: string, value: T, options?: any): Promise<any>;
  fetch<T>(type: string | StorageType, key: string, options?: any): Promise<T>;
  delete(type: string | StorageType, key: string): Promise<any>;
  query<T>(type: string | StorageType, qs: StorageQuery, options?: any): Promise<{ records: T[]; [x: string]: any }>;
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

export type getOptionsAndCallback<TOptions, TReturn> =
  | [TOptions]
  | [(err: Error, result: TReturn) => void]
  | [TOptions, (err: Error, result: TReturn) => void];

export type postponed = { id: string; type: string };

export interface MiddlewareEngineStatus {
  token: string;
  name: string;
  state?: BpmnEngineRunningStatus;
  activityStatus?: ActivityStatus;
  sequenceNumber?: number;
  postponed?: postponed[];
  caller?: Caller;
  expireAt?: Date;
}

export interface MiddlewareEngineState extends MiddlewareEngineStatus {
  engine?: BpmnEngineExecutionState;
}

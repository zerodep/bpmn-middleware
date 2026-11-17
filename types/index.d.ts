/**
 * BPMN 2 Engine middleware
 * @param {import('./interfaces.js').BpmnMiddlewareOptions} [options]
 * @returns {import('express').Router & { engines: Engines, middleware: BpmnEngineMiddleware }}
 */
export function bpmnEngineMiddleware(options?: import("./interfaces.js").BpmnMiddlewareOptions): import("express").Router & {
    engines: Engines;
    middleware: BpmnEngineMiddleware;
};
export { BpmnEngineMiddleware } from "./bpmn-middleware.js";
export * from "./constants.js";
export type BpmnMiddlewareOptions = import("./interfaces.js").BpmnMiddlewareOptions;
export type ExecuteOptions = import("./interfaces.js").ExecuteOptions;
export type StartDeploymentOptions = import("./interfaces.js").StartDeploymentOptions;
export type StartDeploymentResult = import("./interfaces.js").StartDeploymentResult;
export type MiddlewareEngineStatus = import("./interfaces.js").MiddlewareEngineStatus;
export type MiddlewareEngineState = import("./interfaces.js").MiddlewareEngineState;
export type SignalBody = import("./interfaces.js").SignalBody;
export type IStorageAdapter = import("./interfaces.js").IStorageAdapter;
export type StartDeployment = import("./bpmn-middleware.js").StartDeployment;
export type TokenParameter = import("./bpmn-middleware.js").TokenParameter;
export type BpmnMiddlewareResponseLocals = import("./bpmn-middleware.js").BpmnMiddlewareResponseLocals;
import { Engines } from './engines.js';
import { BpmnEngineMiddleware } from './bpmn-middleware.js';
import { MemoryAdapter } from './memory-adapter.js';
import { HttpError } from './errors.js';
import { StorageError } from './errors.js';
import { MiddlewareEngine } from './middleware-engine.js';
export { Engines, MemoryAdapter, HttpError, StorageError, MiddlewareEngine };
//# sourceMappingURL=index.d.ts.map
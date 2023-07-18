import { expectAssignable, expectType } from 'tsd';
import { Router } from 'express';
import { LRUCache } from 'lru-cache';

import { bpmnEngineMiddleware, Engines, MemoryAdapter, MiddlewareEngine } from '../';

expectAssignable<Router>(bpmnEngineMiddleware());
expectType<Engines>(bpmnEngineMiddleware().engines);
expectType<Engines>(new Engines({
  adapter: new MemoryAdapter(),
  engineCache: new LRUCache<string, MiddlewareEngine>({max: 1000}),
}));
expectType<Engines>(new Engines({ adapter: new MemoryAdapter() }));
expectType<MiddlewareEngine>(new Engines({ adapter: new MemoryAdapter() }).execute({
  token: 'token',
}));

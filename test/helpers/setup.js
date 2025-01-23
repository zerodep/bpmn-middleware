process.env.NODE_ENV = 'test';

// LRUCache fix to be enable Date manipulation
globalThis.performance = {
  now() {
    return Date.now();
  },
};

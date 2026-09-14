import { EventEmitter } from 'node:events';

import amqplib from 'amqplib';

import { assertTopology, decode, STATUS_QUEUE } from './topology.js';

/**
 * Read model built from the engine event stream.
 *
 * Consumes every event and keeps one status per token, the query side of the api.
 */
export class ReadModel extends EventEmitter {
  /** @type {Map<string, EngineStatus>} */
  statuses = new Map();

  /**
   * @param {string} token
   */
  get(token) {
    return this.statuses.get(token);
  }

  list() {
    return [...this.statuses.values()];
  }

  /**
   * Resolve when the status of token satisfies the predicate
   * @param {string} token
   * @param {(status: EngineStatus) => boolean} predicate
   * @returns {Promise<EngineStatus>}
   */
  waitFor(token, predicate) {
    return new Promise((resolve) => {
      const current = this.get(token);
      if (current && predicate(current)) return resolve(current);

      const onChange = (/** @type {EngineStatus} */ status) => {
        if (status.token !== token || !predicate(status)) return;
        this.off('change', onChange);
        resolve(status);
      };
      this.on('change', onChange);
    });
  }

  /**
   * Resolve when the selector picks at least count statuses
   * @param {(statuses: EngineStatus[]) => EngineStatus[]} select
   * @param {number} [count]
   * @returns {Promise<EngineStatus[]>}
   */
  waitForMany(select, count = 1) {
    return new Promise((resolve) => {
      const current = select(this.list());
      if (current.length >= count) return resolve(current);

      const onChange = () => {
        const selected = select(this.list());
        if (selected.length < count) return;
        this.off('change', onChange);
        resolve(selected);
      };
      this.on('change', onChange);
    });
  }

  /**
   * Apply an engine event
   * @param {string} routingKey engine event name
   * @param {any} content event content
   * @param {{ token: string, deployment?: string, worker?: string }} headers
   */
  apply(routingKey, content, headers) {
    const { token, deployment, worker } = headers;
    const status = this.statuses.get(token) ?? { token, state: 'running', waiting: [] };
    status.deployment = deployment ?? status.deployment;
    status.worker = worker ?? status.worker;
    status.updatedAt = new Date().toISOString();

    switch (routingKey) {
      case 'activity.wait':
        if (!status.waiting.includes(content.id)) status.waiting.push(content.id);
        status.state = 'waiting';
        break;
      case 'activity.end':
      case 'activity.discard':
        status.waiting = status.waiting.filter((id) => id !== content.id);
        status.state = 'running';
        break;
      case 'definition.end':
        status.output = content.output;
        if (content.caller) status.caller = content.caller;
        break;
      case 'engine.end':
        status.state = 'completed';
        status.waiting = [];
        break;
      case 'engine.error':
      case 'command.error':
        status.state = 'error';
        status.error = content.error ?? content;
        break;
      case 'engine.stop':
        status.state = status.waiting.length ? 'waiting' : status.state;
        break;
    }

    this.statuses.set(token, status);
    this.emit('change', status);
    return status;
  }
}

/**
 * Connect a read model to the events exchange
 * @param {string} url AMQP url
 * @returns {Promise<{ readModel: ReadModel, close: () => Promise<void> }>}
 */
export async function startReadModel(url) {
  const readModel = new ReadModel();
  const connection = await amqplib.connect(url);
  const channel = await connection.createChannel();
  await assertTopology(channel);

  await channel.consume(STATUS_QUEUE, (message) => {
    const { headers } = message.properties;
    if (headers?.token) readModel.apply(message.fields.routingKey, decode(message), /** @type {any} */ (headers));
    channel.ack(message);
  });

  return {
    readModel,
    close() {
      return connection.close();
    },
  };
}

/**
 * @typedef {object} EngineStatus
 * @property {string} token
 * @property {string} [deployment]
 * @property {string} [worker] name of the worker that last touched the engine
 * @property {'running' | 'waiting' | 'completed' | 'error'} state
 * @property {string[]} waiting ids of activities waiting for input
 * @property {Record<string, any>} [caller] calling activity when started by a call activity
 * @property {Record<string, any>} [output]
 * @property {{ name?: string, message: string }} [error]
 * @property {string} updatedAt
 */

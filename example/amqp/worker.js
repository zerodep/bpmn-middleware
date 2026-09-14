import { EventEmitter } from 'node:events';

import amqplib from 'amqplib';
import Debug from 'debug';
import { Broker } from 'smqp';
import { Engines, STORAGE_TYPE_DEPLOYMENT, STORAGE_TYPE_FILE, HttpError } from 'bpmn-middleware';

import {
  assertTopology,
  encode,
  decode,
  decodeError,
  EVENTS_EXCHANGE,
  COMMANDS_QUEUE,
  CALLS_QUEUE,
  CALL_RESULTS_QUEUE,
} from './topology.js';

/**
 * Start a worker that runs engines on behalf of commands and call activities.
 *
 * Engines run until they wait for outside input, then they are stopped and
 * their state stays in the shared adapter. The next command resumes the
 * engine from that state, on whichever worker picks the command up.
 * @param {WorkerOptions} options
 * @returns {Promise<Worker>}
 */
export async function startWorker(options) {
  const { url, name, adapter } = options;
  const debug = Debug(`bpmn-middleware:amqp:${name}`);

  const engineOptions = { ...options.engineOptions };

  const connection = await amqplib.connect(url);
  const channel = await connection.createChannel();
  await assertTopology(channel);
  await channel.prefetch(1);

  const listener = new EventEmitter();
  listener.on('error', (err) => debug('engine error', err));
  listener.on('warn', (err) => debug('engine warning', err));

  const broker = new Broker();
  const engines = new Engines({ name, adapter, broker, engineOptions, autosaveEngineState: true, idleTimeout: 10000 });

  // forward every engine event to the events exchange, the middleware shovels them onto the exchange named after the engines instance
  broker.assertExchange(name, 'topic', { durable: false, autoDelete: false });
  broker.subscribeTmp(
    name,
    '#',
    (routingKey, message) => {
      const { token, deployment } = message.properties;
      channel.publish(EVENTS_EXCHANGE, routingKey, encode(message.content), {
        contentType: 'application/json',
        headers: { token, deployment, worker: name },
      });
    },
    { noAck: true }
  );

  /**
   * @param {import('amqplib').ConsumeMessage} message
   * @param {(content: any, message: import('amqplib').ConsumeMessage) => Promise<any>} handle
   */
  async function consume(message, handle) {
    const content = decode(message);
    try {
      await handle(content, message);
    } catch (err) {
      debug('failed to handle %s', message.fields.routingKey, err);
      channel.publish(EVENTS_EXCHANGE, 'command.error', encode({ command: content, error: err }), {
        contentType: 'application/json',
        headers: { token: content.token ?? message.properties.headers?.token, worker: name },
      });
    }
    channel.ack(message);
  }

  await channel.consume(COMMANDS_QUEUE, (message) => consume(message, onCommand));
  await channel.consume(CALLS_QUEUE, (message) => consume(message, onCallActivity));
  await channel.consume(CALL_RESULTS_QUEUE, (message) => consume(message, onCallResult));

  debug('started');

  return {
    name,
    engines,
    async close() {
      engines.stopAll();
      await connection.close();
    },
  };

  /**
   * @param {Command} command
   */
  async function onCommand(command) {
    debug('%s %s', command.type, command.token);
    switch (command.type) {
      case 'start': {
        return release(await execute(command.deployment, command));
      }
      case 'signal': {
        return release(await engines.resumeAndSignalActivity(command.token, listener, command.body));
      }
      default:
        throw new Error(`unknown command type ${/** @type {any} */ (command).type}`);
    }
  }

  /**
   * Start called deployment, the counterpart of the middleware activity.call handling
   * @param {any} content `activity.call` event content
   * @param {import('amqplib').ConsumeMessage} message
   */
  async function onCallActivity(content, message) {
    const [category, ...rest] = content.calledElement.split(':');
    if (category !== STORAGE_TYPE_DEPLOYMENT || !rest.length) return;
    if (content.isRecovered) return;

    const caller = createCaller(content, message);
    const deployment = rest.join(':');
    debug('call %s from %s %s', deployment, caller.deployment, caller.token);

    try {
      release(await execute(deployment, { variables: content.input, caller, settings: { ...content.settings, caller: { ...caller } } }));
    } catch (err) {
      release(await engines.resumeAndFailActivity(caller.token, listener, { ...caller, message: err }));
    }
  }

  /**
   * Signal or fail the calling activity, the counterpart of the middleware definition.end handling
   * @param {any} content `definition.end` or `definition.error` event content
   * @param {import('amqplib').ConsumeMessage} message
   */
  async function onCallResult(content, message) {
    const { caller } = content;
    if (!caller) return;

    const fromToken = message.properties.headers?.token;
    debug('%s of %s addressing %s %s', message.fields.routingKey, fromToken, caller.deployment, caller.token);

    if (message.fields.routingKey === 'definition.error') {
      return release(
        await engines.resumeAndFailActivity(caller.token, listener, { ...caller, fromToken, message: decodeError(content.error) })
      );
    }
    return release(await engines.resumeAndSignalActivity(caller.token, listener, { ...caller, fromToken, message: content.output }));
  }

  /**
   * @param {string} deployment
   * @param {{ token?: string, variables?: Record<string, any>, businessKey?: string, caller?: any, settings?: any }} executeOptions
   */
  async function execute(deployment, executeOptions) {
    const files = await adapter.fetch(STORAGE_TYPE_DEPLOYMENT, deployment);
    if (!files) throw new HttpError(`deployment with name ${deployment} does not exist`, 404, 'BPMN_DEPLOYMENT_NOT_FOUND');
    const { content: source } = await adapter.fetch(STORAGE_TYPE_FILE, files[0].path);

    const { token, variables, businessKey, caller, settings } = executeOptions;

    return engines.execute({
      ...engineOptions,
      name: deployment,
      token,
      source,
      listener,
      settings: { ...engineOptions.settings, ...settings },
      variables: { ...engineOptions.variables, ...variables, businessKey },
      businessKey,
      caller,
    });
  }

  /**
   * Stop an engine that waits for outside input so that any worker can resume it
   * @param {import('bpmn-middleware').MiddlewareEngine} engine
   */
  function release(engine) {
    if (engine.state === 'running' && engine.activityStatus === 'wait') {
      debug('%s waits, stopping', engine.token);
      engine.stop();
    }
  }
}

/**
 * Caller record from an activity.call event, see bpmn-middleware Caller
 * @param {any} content
 * @param {import('amqplib').ConsumeMessage} message
 */
function createCaller(content, message) {
  const { token, deployment } = message.properties.headers;
  const { id, type, executionId, index } = content;
  return { token, deployment, id, type, executionId, index };
}

/**
 * @typedef {object} StartCommand
 * @property {'start'} type
 * @property {string} token engine token decided by the api so the client can query it right away
 * @property {string} deployment deployment name
 * @property {Record<string, any>} [variables]
 * @property {string} [businessKey]
 */

/**
 * @typedef {object} SignalCommand
 * @property {'signal'} type
 * @property {string} token
 * @property {import('bpmn-middleware').SignalBody} body
 */

/** @typedef {StartCommand | SignalCommand} Command */

/**
 * @typedef {object} WorkerOptions
 * @property {string} url AMQP url
 * @property {string} name worker name, also the name of the local engines exchange
 * @property {import('bpmn-middleware').IStorageAdapter} adapter storage adapter shared with the api and the other workers
 * @property {import('bpmn-engine').BpmnEngineOptions} [engineOptions]
 */

/**
 * @typedef {object} Worker
 * @property {string} name
 * @property {Engines} engines
 * @property {() => Promise<void>} close
 */

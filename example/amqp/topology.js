/**
 * AMQP topology shared by the api and the workers.
 *
 * Commands go through a work queue, engine events are published on a topic
 * exchange and fan out to the queues that need them.
 */

/** Topic exchange receiving every engine event, routing key is the engine event name, e.g. `activity.wait` */
export const EVENTS_EXCHANGE = 'bpmn-events';
/** Work queue with start and signal commands, consumed by workers */
export const COMMANDS_QUEUE = 'bpmn-commands';
/** Call activity requests, `activity.call` events, consumed by workers */
export const CALLS_QUEUE = 'bpmn-calls';
/** Called process results, `definition.end` and `definition.error` events, consumed by workers */
export const CALL_RESULTS_QUEUE = 'bpmn-call-results';
/** Every event, consumed by the read model */
export const STATUS_QUEUE = 'bpmn-status';

/**
 * Declare exchange, queues and bindings, idempotent
 * @param {import('amqplib').Channel} channel
 */
export async function assertTopology(channel) {
  await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });

  await channel.assertQueue(COMMANDS_QUEUE, { durable: true });

  await channel.assertQueue(CALLS_QUEUE, { durable: true });
  await channel.bindQueue(CALLS_QUEUE, EVENTS_EXCHANGE, 'activity.call');

  await channel.assertQueue(CALL_RESULTS_QUEUE, { durable: true });
  await channel.bindQueue(CALL_RESULTS_QUEUE, EVENTS_EXCHANGE, 'definition.end');
  await channel.bindQueue(CALL_RESULTS_QUEUE, EVENTS_EXCHANGE, 'definition.error');

  await channel.assertQueue(STATUS_QUEUE, { durable: true });
  await channel.bindQueue(STATUS_QUEUE, EVENTS_EXCHANGE, '#');
}

/**
 * Encode message body as JSON, errors are reduced to name and message
 * @param {any} body
 */
export function encode(body) {
  return Buffer.from(
    JSON.stringify(body, (_key, value) => {
      if (value instanceof Error) return { name: value.name, message: value.message, code: /** @type {any} */ (value).code };
      return value;
    })
  );
}

/**
 * Decode JSON message body
 * @param {import('amqplib').ConsumeMessage} message
 */
export function decode(message) {
  return JSON.parse(message.content.toString());
}

/**
 * Revive an error reduced by encode
 * @param {{ name?: string, message: string, code?: string }} serialized
 */
export function decodeError(serialized) {
  const { name, message, code } = serialized;
  return Object.assign(new Error(message), { name, code });
}

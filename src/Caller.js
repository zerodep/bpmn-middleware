/**
 * Calling process
 */
export class Caller {
  /**
   * Constructor
   * @param {string} token Calling process token
   * @param {string} deployment Calling process deployment name
   * @param {string} id Calling activity id
   * @param {string} type Calling activity type
   * @param {string} executionId Calling activity execution id
   */
  constructor(token, deployment, id, type, executionId) {
    this.token = token;
    this.deployment = deployment;
    this.id = id;
    this.type = type;
    this.executionId = executionId;
  }
}

/**
 * Create caller from activity message
 * @param {import('smqp').Message} activityApi
 */
export function fromActivityMessage(activityApi) {
  const { token, deployment } = activityApi.properties;
  const { id, type, executionId } = activityApi.content;
  return new Caller(token, deployment, id, type, executionId);
}

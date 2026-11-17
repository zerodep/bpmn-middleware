/**
 * Create caller from activity message
 * @param {import('smqp').Message} activityApi
 */
export function createCallerFromActivityMessage(activityApi: import("smqp").Message): Caller;
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
     * @param {number} [index] Calling activity multi-instance index
     */
    constructor(token: string, deployment: string, id: string, type: string, executionId: string, index?: number);
    token: string;
    deployment: string;
    id: string;
    type: string;
    executionId: string;
    index: number;
}
//# sourceMappingURL=caller.d.ts.map
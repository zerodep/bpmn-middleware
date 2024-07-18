import path from 'node:path';
import { FlowScripts, JavaScriptResource } from '@onify/flow-extensions/FlowScripts';
import { HttpError, STORAGE_TYPE_FILE } from '../src/index.js';

const allowedMimesPattern = /^(application|text)\/(node|javascript|octet-stream)/;

export class JavaScriptAdapterResource extends JavaScriptResource {
  /**
   * @param {JavaScriptAdapterResource} fromScript
   * @param {import('../types/interfaces.js').IStorageAdapter} adapter
   */
  constructor(fromScript, adapter) {
    super(fromScript.flowName, fromScript.resource, fromScript.resourceBase, fromScript.runContext, fromScript.options);
    this.adapter = adapter;
  }
  async getResourceContent(resourceBase, resource) {
    const file = await this.adapter.fetch(STORAGE_TYPE_FILE, path.basename(resource));

    if (!file) throw new HttpError(`external resource ${path.join(resourceBase, resource)} not found`, 404);

    if (!allowedMimesPattern.test(file.mimetype)) {
      throw new HttpError(`external resource ${path.join(resourceBase, resource)} content type ${file.mimetype} not allowed`, 415);
    }

    return file.content;
  }
}

export class MiddlewareScripts extends FlowScripts {
  /**
   * @param {import('../types/interfaces.js').IStorageAdapter} adapter Middleware storage adapter
   * @param {string} deploymentName Deployment name
   * @param {string} resourceBase Resource base path, ignored in this implementation
   * @param {unknown} [runContext] additional VM run context properties
   * @param {import('@onify/flow-extensions/FlowScripts').FlowScriptOptions} [options]
   */
  constructor(adapter, deploymentName, resourceBase, runContext, options) {
    super(deploymentName, resourceBase, runContext, options);
    this.adapter = adapter;
  }
  /**
   * @param {import('@onify/flow-extensions/FlowScripts').registerArgument} element
   */
  register(element) {
    super.register(element);

    let script;
    if ((script = this.scripts.get(element.id)) instanceof JavaScriptResource) {
      this.scripts.set(element.id, new JavaScriptAdapterResource(script, this.adapter));
    }
  }
}

/**
 * Middleware script factory
 * @param {import('../types/interfaces.js').IStorageAdapter} adapter
 * @param {string} deploymentName
 */
export function factory(adapter, deploymentName) {
  return new MiddlewareScripts(adapter, deploymentName, '.');
}

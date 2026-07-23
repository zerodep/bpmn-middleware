import Debug from 'debug';
import { DmnModdle } from 'dmn-moddle';
import { Context, Definition, Environment } from 'dmn-elements';
import { dmn, alignDmnNamespaces } from 'dmn-elements/dmn-moddle';
import { HttpError, STORAGE_TYPE_DEPLOYMENT, STORAGE_TYPE_FILE } from 'bpmn-middleware';

/**
 * Evaluate a deployed DMN decision
 * @param {import('types').IStorageAdapter} adapter storage adapter
 * @param {string} deploymentName deployment holding the DMN file
 * @param {string} decisionId id of the decision to evaluate
 * @param {Record<string, any>} [input] decision input, e.g. input data values by variable name
 * @returns {Promise<{result: any, trace: any[]}>} decision result with evaluation trace
 */
export async function evaluateDecision(adapter, deploymentName, decisionId, input) {
  const deployment = await adapter.fetch(STORAGE_TYPE_DEPLOYMENT, deploymentName);
  if (!deployment) {
    throw new HttpError(`deployment with name ${deploymentName} does not exist`, 404, 'BPMN_DEPLOYMENT_NOT_FOUND');
  }

  const decisionFiles = deployment.filter((file) => file.path.endsWith('.dmn'));
  if (!decisionFiles.length) {
    throw new HttpError(`deployment ${deploymentName} has no deployed decisions`, 404);
  }

  const moddle = new DmnModdle({ dmn });
  for (const file of decisionFiles) {
    const decisionSource = await adapter.fetch(STORAGE_TYPE_FILE, file.path);
    const { rootElement } = await moddle.fromXML(alignDmnNamespaces(decisionSource.content));
    const context = new Context(rootElement, new Environment({ Logger }));
    if (!context.getDecisionById(decisionId)) continue;
    return new Definition(context).trace(decisionId, input);
  }

  throw new HttpError(`no decision with id ${decisionId} is deployed in ${deploymentName}`, 404);
}

/**
 * Scoped debug logger for decision evaluation, enable with DEBUG=dmn-elements:*
 * @param {string} scope element scope, e.g. dmn:decisiontable
 */
function Logger(scope) {
  return {
    debug: Debug(`dmn-elements:${scope}`),
    error: Debug(`dmn-elements:error:${scope}`),
    warn: Debug(`dmn-elements:warn:${scope}`),
  };
}

/**
 * Evaluate decision route factory, request body is passed as decision input
 * @param {import('types').IStorageAdapter} adapter storage adapter
 */
export function decisionRoute(adapter) {
  /**
   * @param {import('express').Request<{deploymentName:string, decisionId:string}>} req
   * @param {import('express').Response<{result:any, trace:any[]}>} res
   * @param {import('express').NextFunction} next
   */
  return async function evaluateDecisionRoute(req, res, next) {
    try {
      const { deploymentName, decisionId } = req.params;
      const { result, trace } = await evaluateDecision(adapter, deploymentName, decisionId, req.body);
      res.send({ result, trace });
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Business rule task engine extension factory - points every business rule task to the shared DMN service
 * @param {import('types').IStorageAdapter} adapter storage adapter
 */
export function dmnServiceExtension(adapter) {
  /**
   * @param {import('bpmn-elements').Activity} activity
   */
  return function dmnExtension(activity) {
    if (activity.type !== 'bpmn:BusinessRuleTask') return;
    activity.behaviour.Service = DmnService.bind(null, adapter);
  };
}

/**
 * Business rule task DMN service, evaluates the decision addressed by camunda:decisionRef="deploymentName/decisionId"
 * @param {import('types').IStorageAdapter} adapter storage adapter
 * @param {import('bpmn-elements').Activity} activity business rule task
 */
function DmnService(adapter, activity) {
  this.type = 'dmn';
  this.adapter = adapter;
  this.activity = activity;
}

/**
 * @param {import('bpmn-elements').ElementBrokerMessage} executionMessage
 * @param {(err?: Error, result?: any) => void} callback
 */
DmnService.prototype.execute = function execute(executionMessage, callback) {
  const activity = this.activity;
  const decisionRef = activity.behaviour.decisionRef;
  const [deploymentName, decisionId] = decisionRef ? decisionRef.split('/') : [];
  if (!deploymentName || !decisionId) {
    return callback(new Error(`<${activity.id}> camunda:decisionRef with format "deploymentName/decisionId" is required`));
  }

  const input = { ...activity.environment.variables, ...executionMessage.content.input };

  evaluateDecision(this.adapter, deploymentName, decisionId, input).then(
    ({ result }) => callback(null, result),
    (err) => callback(err)
  );
};

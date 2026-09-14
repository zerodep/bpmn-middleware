import { randomUUID } from 'node:crypto';

import amqplib from 'amqplib';
import express from 'express';
import { bpmnEngineMiddleware, HttpError, STORAGE_TYPE_DEPLOYMENT } from 'bpmn-middleware';

import { errorHandler } from '../middleware/error-handler.js';
import { assertTopology, encode, COMMANDS_QUEUE } from './topology.js';
import { startReadModel } from './read-model.js';

/**
 * Command and query api.
 *
 * Deployments go through the ordinary middleware routes under `/rest`, the api never runs an engine itself.
 * Start and signal are commands published to the commands queue and picked up by a worker,
 * status is answered from the read model fed by the engine event stream.
 * @param {{ url: string, adapter: import('bpmn-middleware').IStorageAdapter }} options AMQP url and storage adapter shared with the workers
 */
export async function createApp({ url, adapter }) {
  const connection = await amqplib.connect(url);
  const channel = await connection.createChannel();
  await assertTopology(channel);

  const { readModel, close: closeReadModel } = await startReadModel(url);

  const app = express();
  app.locals.readModel = readModel;
  app.locals.close = async () => {
    await closeReadModel();
    await connection.close();
  };

  app.use('/rest', bpmnEngineMiddleware({ adapter, name: 'amqp-api' }));

  app.post('/start/:deploymentName', express.json(), async (req, res, next) => {
    try {
      const { deploymentName } = req.params;
      if (!(await adapter.fetch(STORAGE_TYPE_DEPLOYMENT, deploymentName))) {
        throw new HttpError(`deployment with name ${deploymentName} does not exist`, 404, 'BPMN_DEPLOYMENT_NOT_FOUND');
      }

      const token = randomUUID();
      send({ type: 'start', token, deployment: deploymentName, variables: req.body, businessKey: req.query.businessKey });
      res.status(201).send({ id: token });
    } catch (err) {
      next(err);
    }
  });

  app.post('/signal/:token', express.json(), (req, res) => {
    const { token } = req.params;
    send({ type: 'signal', token, body: req.body });
    res.status(202).send({ id: token });
  });

  app.get('/status', (_req, res) => {
    res.send(readModel.list());
  });

  app.get('/status/:token', (req, res, next) => {
    const status = readModel.get(req.params.token);
    if (!status) return next(new HttpError(`Token ${req.params.token} not found`, 404));
    res.send(status);
  });

  app.use(errorHandler);

  return app;

  /**
   * @param {import('./worker.js').Command} command
   */
  function send(command) {
    channel.sendToQueue(COMMANDS_QUEUE, encode(command), { persistent: true, contentType: 'application/json' });
  }
}

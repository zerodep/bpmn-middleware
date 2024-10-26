import { createRequire } from 'node:module';
import debug from 'debug';

const nodeRequire = createRequire(import.meta.url);

const { name } = nodeRequire('../package.json');

export default debug(name);

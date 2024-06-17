import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import commonjs from '@rollup/plugin-commonjs';

const nodeRequire = createRequire(fileURLToPath(import.meta.url));
const { module, main, dependencies, peerDependencies } = nodeRequire('./package.json');

const external = new Set(
  ['node:module', 'node:url', 'node:vm', 'node:events', 'node:crypto', 'node:path', 'node:url']
    .concat(Object.keys(dependencies))
    .concat(Object.keys(peerDependencies)),
);

// export default {
//   input: './src/index.js',
//   plugins: [commonjs({ sourceMap: false })],
//   external: ['bpmn-engine', 'express', 'lru-cache', 'multer', 'node:crypto', 'node:fs', 'node:module', 'node:path'],
//   output: [
//     {
//       file: 'dist/main.cjs',
//       format: 'cjs',
//       exports: 'named',
//     },
//   ],
// };

export default {
  input: module,
  plugins: [
    commonjs({
      sourceMap: false,
    }),
  ],
  output: [
    {
      file: main,
      format: 'cjs',
      exports: 'named',
      footer: 'module.exports = Object.assign(exports.default, exports);',
    },
  ],
  external: [...external],
};

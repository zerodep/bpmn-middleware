import commonjs from '@rollup/plugin-commonjs';

export default {
  input: './src/index.js',
  plugins: [
    commonjs({ sourceMap: false }),
  ],
  external: [
    'bpmn-engine',
    'express',
    'lru-cache',
    'multer',
    'node:crypto',
    'node:fs',
    'node:module',
    'node:path',
  ],
  output: [
    {
      file: 'dist/main.cjs',
      format: 'cjs',
      exports: 'named',
    },
  ],
};

import js from '@eslint/js';
import globals from 'globals';

const rules = {
  'dot-notation': [2, { allowKeywords: true }],
  'eol-last': 2,
  eqeqeq: 2,
  'no-alert': 2,
  'no-array-constructor': 2,
  'no-caller': 2,
  'no-catch-shadow': 2,
  'no-console': 1,
  'no-eval': 2,
  'no-extend-native': 2,
  'no-extra-bind': 2,
  'no-fallthrough': 'off',
  'no-implied-eval': 2,
  'no-iterator': 2,
  'no-label-var': 2,
  'no-labels': 2,
  'no-lone-blocks': 2,
  'no-loop-func': 2,
  'no-multi-spaces': 2,
  'no-multi-str': 2,
  'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0, maxBOF: 0 }],
  'no-new-func': 2,
  'no-new-object': 2,
  'no-new-wrappers': 2,
  'no-octal-escape': 2,
  'no-path-concat': 2,
  'no-process-exit': 2,
  'no-proto': 2,
  'no-prototype-builtins': 2,
  'no-return-assign': 2,
  'no-script-url': 2,
  'no-sequences': 2,
  'no-shadow-restricted-names': 2,
  'no-shadow': 0,
  'no-spaced-func': 2,
  'no-trailing-spaces': 2,
  'no-undef-init': 2,
  'no-undef': 2,
  'no-underscore-dangle': 0,
  'no-unused-expressions': 2,
  'no-unused-vars': 2,
  'no-use-before-define': ['error', 'nofunc'],
  'no-var': 2,
  'no-with': 2,
  'prefer-const': ['error', { destructuring: 'all' }],
  'require-atomic-updates': 0,
  'require-await': 2,
  'semi-spacing': [2, { before: false, after: true }],
  semi: [2, 'always'],
  'space-before-blocks': 2,
  'space-before-function-paren': [2, { anonymous: 'never', named: 'never' }],
  'space-infix-ops': 2,
  'space-unary-ops': [2, { words: true, nonwords: false }],
  'unicode-bom': ['error', 'never'],
  yoda: [2, 'never'],
};

export default [
  js.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2022,
      },
    },
    rules,
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      globals: {
        ...globals.nodeBuiltin,
      },
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.nodeBuiltin,
        ...globals.mocha,
        expect: 'readonly',
        beforeEachScenario: 'readonly',
        afterEachScenario: 'readonly',
        Buffer: 'readonly',
        Feature: 'readonly',
        Scenario: 'readonly',
        Given: 'readonly',
        When: 'readonly',
        Then: 'readonly',
        And: 'readonly',
        But: 'readonly',
      },
    },
    rules: {
      'no-unused-expressions': 0,
    },
  },
  {
    files: ['test/resources/*.cjs'],
    languageOptions: {
      globals: {
        next: 'readonly',
      },
    },
    rules: {
      'no-console': 0,
    },
  },
  {
    ignores: ['coverage/**/*', 'node_modules/**/*', 'tmp/*', 'dist/*'],
  },
];

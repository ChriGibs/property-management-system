// Flat config for ESLint v9+
const eslint = require('@eslint/js');
const nodePlugin = require('eslint-plugin-node');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'public/**',
      'views/**'
    ]
  },
  eslint.configs.recommended,
  {
    plugins: { node: nodePlugin },
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off'
    }
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        after: 'readonly'
      }
    }
  }
];



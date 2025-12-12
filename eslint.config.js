const js = require('@eslint/js')
const tseslint = require('@typescript-eslint/eslint-plugin')
const prettier = require('eslint-config-prettier')

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    plugins: {
      '@typescript-eslint': tseslint,
    },
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
      globals: {
        process: 'readonly',
        console: 'readonly',
        setInterval: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_|[A-Z][A-Z_]+$',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-unused-vars': 'off',
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
      'no-undef': 'off',
    },
  },
  {
    files: [
      '**/*.d.ts',
      '**/types/**/*.ts',
      '**/enums/**/*.ts',
      '**/entities/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
]

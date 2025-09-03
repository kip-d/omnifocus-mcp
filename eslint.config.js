import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  // Base ESLint recommended rules
  eslint.configs.recommended,
  
  // TypeScript files configuration
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TypeScript recommended rules (but relaxed for MCP server)
      ...tseslint.configs['recommended'].rules,
      
      // Relaxed any type rules for MCP server
      '@typescript-eslint/no-explicit-any': 'warn', // Allow any but warn
      '@typescript-eslint/no-unsafe-assignment': 'warn', // Warn but don't error
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      
      // Keep useful warnings
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      
      // Enforce consistency
      'no-console': 'off', // MCP servers often use console for debugging
      'quotes': ['error', 'single', { avoidEscape: true }],
      'semi': ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],
      'no-trailing-spaces': 'error',
      'eol-last': ['error', 'always'],
      
      // Additional useful rules
      'no-case-declarations': 'error',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/require-await': 'warn',
    },
  },
  
  // Test files - relax some rules
  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  
  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      // Generated or vendor TypeScript definitions and API shims
      'src/omnifocus/api/**',
      '*.js', // Since this is a TypeScript project
      '*.mjs',
      '*.cjs',
      'tests/**/*.js', // Except test files that are specifically JS
    ],
  },
];

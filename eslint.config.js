import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';

export default [
  // Base ESLint recommended rules
  eslint.configs.recommended,

  // SonarJS recommended rules (code smell & bug detection)
  sonarjs.configs.recommended,

  // TypeScript files configuration
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        // Use both tsconfigs: main for src/, test for tests/
        project: ['./tsconfig.json', './tsconfig.test.json'],
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
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      // Enforce consistency
      'no-console': 'off', // MCP servers often use console for debugging
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],
      'no-trailing-spaces': 'error',
      'eol-last': ['error', 'always'],

      // SonarJS overrides — relaxed for this codebase
      'sonarjs/cognitive-complexity': ['warn', 20],
      'sonarjs/no-nested-conditional': 'warn',
      'sonarjs/different-types-comparison': 'warn',
      'sonarjs/deprecation': 'warn',
      'sonarjs/prefer-regexp-exec': 'warn',
      'sonarjs/slow-regex': 'warn',
      'sonarjs/no-commented-code': 'warn',
      'sonarjs/todo-tag': 'warn',
      'sonarjs/fixme-tag': 'warn',
      'sonarjs/pseudo-random': 'off', // Only used for nonces/ephemeral IDs
      'sonarjs/no-os-command-from-path': 'off', // Expected: JXA/osascript execution
      'sonarjs/no-nested-functions': 'off', // Common TS/functional pattern
      'sonarjs/code-eval': 'off', // Required for JXA evaluateJavascript
      'sonarjs/void-use': 'off', // void used intentionally for fire-and-forget
      'sonarjs/use-type-alias': 'warn',
      'sonarjs/no-nested-template-literals': 'warn',
      'sonarjs/no-alphabetical-sort': 'warn',
      'sonarjs/redundant-type-aliases': 'warn',
      'sonarjs/no-misleading-array-reverse': 'warn',
      'sonarjs/no-undefined-argument': 'warn',

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
      'sonarjs/no-identical-functions': 'off',
      'sonarjs/no-commented-code': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-nested-conditional': 'off',
      'sonarjs/no-dead-store': 'off',
    },
  },

  // JXA bridge and embedded script wrappers - boundary layer
  {
    files: [
      'src/omnifocus/OmniAutomation.ts',
      'src/omnifocus/DiagnosticOmniAutomation.ts',
      'src/omnifocus/scripts/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
    },
  },

  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '.claude/worktrees/**',
      // Generated or vendor TypeScript definitions and API shims
      'src/omnifocus/api/**',
      '*.js', // Since this is a TypeScript project
      '*.mjs',
      '*.cjs',
      'vitest.config.ts', // Not in any tsconfig project
      'tests/**/*.js', // Except test files that are specifically JS
    ],
  },
];

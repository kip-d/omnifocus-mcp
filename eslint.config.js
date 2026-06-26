import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import sonarjs from 'eslint-plugin-sonarjs';
import importPlugin from 'eslint-plugin-import';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';
import localRules from './eslint-rules/index.js';

export default [
  // Base ESLint recommended rules
  eslint.configs.recommended,

  // SonarJS recommended rules (code smell & bug detection)
  sonarjs.configs.recommended,

  // Make the stale-eslint-disable audit explicit (global, no `files` key) rather than
  // relying on ESLint 9's implicit flat-config default. Combined with `--max-warnings=0`
  // (npm run lint), an unused `eslint-disable` directive fails the gate. A bare top-level
  // config object applies to every linted file and survives new file-pattern blocks,
  // keeping the guarantee durable against a future ESLint default change (OMN-217).
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },
  },

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
      import: importPlugin,
      '@stylistic': stylistic,
    },
    rules: {
      // TypeScript recommended rules (but relaxed for MCP server)
      ...tseslint.configs['recommended'].rules,

      // Catch split imports from the same module (autofixable; merges type + value).
      'import/no-duplicates': 'error',

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

      // Enforce consistency. The five formatting rules below were ESLint core
      // rules until v8.53.0 froze + deprecated all stylistic rules; they now
      // live in @stylistic/eslint-plugin. Values are unchanged from the core
      // rules — this is a drop-in rename, not a formatting policy change.
      'no-console': 'off', // MCP servers often use console for debugging
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/eol-last': ['error', 'always'],

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

  // Custom OmniFocus MCP rules — applied to tool implementations
  {
    files: ['src/tools/**/*Tool.ts'],
    plugins: {
      'local-rules': localRules,
    },
    rules: {
      'local-rules/extend-base-tool': 'error',
      'local-rules/use-standard-response': 'error',
      'local-rules/use-handle-error': 'error',
      'local-rules/metadata-snake-case': 'error',
    },
  },

  // Custom OmniFocus MCP rules — applied to schema modules
  // Double-gate is deliberate: this config glob scopes the rule to schema
  // dirs, and the rule body re-checks `filename.includes('/schemas/')` so it
  // stays correct if applied via a broader config. Keep both in sync.
  {
    files: ['src/tools/**/schemas/**/*.ts', 'src/tools/schemas/**/*.ts'],
    plugins: {
      'local-rules': localRules,
    },
    rules: {
      'local-rules/export-zod-schema': 'error',
    },
  },

  // Custom OmniFocus MCP rules — applied to the OmniJS/JXA script layer.
  // Bans .whose()/.where(): each predicate is an Apple Event round-trip →
  // 25s+ timeouts on large databases (docs/dev/LESSONS_LEARNED.md). The rule
  // body re-checks the '/omnifocus/scripts/' path (double-gate, deliberate).
  {
    files: ['src/omnifocus/scripts/**/*.ts'],
    plugins: {
      'local-rules': localRules,
    },
    rules: {
      'local-rules/no-whose-where': 'error',
    },
  },

  // Node.js build/utility scripts (plain .js, ESM, run directly with node).
  // The base TS config only wires globals.node for *.ts files; explicit-path
  // lint calls (e.g. from lint-staged) bypass the top-level ignores glob, so
  // we must declare globals here rather than relying on the ignore.
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '.claude/worktrees/**',
      '.archive/**', // Archived dead code — preserved for reference, not in any tsconfig
      // Generated or vendor TypeScript definitions and API shims
      'src/omnifocus/api/**',
      '*.js', // Since this is a TypeScript project
      '*.mjs',
      '*.cjs',
      'vitest.config.ts', // Not in any tsconfig project
      'vitest.stryker.config.ts', // Stryker runner config — not in any tsconfig project
      'tests/**/*.js', // Except test files that are specifically JS
    ],
  },
];

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
      
      // Phase 1: Disable high-volume warning rules (reduces ~1,700 warnings)
      '@typescript-eslint/no-explicit-any': 'off', // 424 warnings → 0
      '@typescript-eslint/no-unsafe-assignment': 'off', // 449 warnings → 0
      '@typescript-eslint/no-unsafe-member-access': 'off', // 846 warnings → 0
      
      // Keep critical safety rules for function boundaries
      '@typescript-eslint/no-unsafe-call': 'warn', // Keep for function calls
      '@typescript-eslint/no-unsafe-argument': 'warn', // Keep for function arguments
      '@typescript-eslint/no-unsafe-return': 'warn', // Keep for return values
      
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
      
      // Phase 1: Disable additional warning rules (reduces ~40 warnings)
      '@typescript-eslint/no-empty-object-type': 'off', // 28 warnings → 0
      '@typescript-eslint/no-redundant-type-constituents': 'off', // 3 warnings → 0
      '@typescript-eslint/require-await': 'warn', // Keep for async/await safety
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
  
  // JXA bridge and embedded script wrappers - boundary layer
  {
    files: ['src/omnifocus/OmniAutomation.ts', 'src/omnifocus/DiagnosticOmniAutomation.ts', 'src/omnifocus/scripts/**/*.ts'],
    rules: {
      // All unsafe rules disabled for JXA bridge layer (already handled by main config)
      '@typescript-eslint/no-explicit-any': 'off',
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

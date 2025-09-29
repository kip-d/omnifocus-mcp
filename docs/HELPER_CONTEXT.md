# Helper Context Types

## Overview

Helper Context Types provide configuration options for helper functions to control performance, error handling, and script generation behavior. This improvement adds a consistent API for configuring helper function behavior across the codebase.

## Features

- **Explicit configuration**: Clear, type-safe options for helper behavior
- **Better defaults**: Context-aware helper selection
- **Performance tuning**: Easy per-use-case adjustment
- **Backwards compatible**: Context parameter is optional
- **Type safety**: TypeScript ensures valid options

## Usage

### Basic Usage

```typescript
import { getAllHelpers } from './omnifocus/scripts/shared/helpers.js';

// Use default configuration
const helpers = getAllHelpers();

// Customize for specific use case
const helpersWithTracking = getAllHelpers({
  performanceTracking: true,
  skipAnalysis: false,
});
```

### Available Options

```typescript
interface HelperContext {
  /**
   * Skip expensive recurring task analysis
   * @default true
   */
  skipAnalysis?: boolean;

  /**
   * Include performance metrics in generated scripts
   * @default false
   */
  performanceTracking?: boolean;

  /**
   * Maximum retry attempts for operations
   * @default 3
   */
  maxRetries?: number;

  /**
   * Operation timeout in milliseconds
   * @default 120000 (2 minutes)
   */
  timeout?: number;

  /**
   * Caching strategy for helper operations
   * @default 'aggressive'
   */
  cacheStrategy?: 'aggressive' | 'conservative' | 'disabled';

  /**
   * Helper function complexity level
   * @default 'standard'
   */
  helperLevel?: 'minimal' | 'standard' | 'full';
}
```

### Default Configuration

```typescript
const DEFAULT_HELPER_CONTEXT = {
  skipAnalysis: true,           // Skip expensive analysis for daily use
  performanceTracking: false,   // No metrics overhead by default
  maxRetries: 3,                // Reasonable retry count
  timeout: 120000,              // 2 minute timeout
  cacheStrategy: 'aggressive',  // Cache everything possible
  helperLevel: 'standard',      // Balanced helper set
};
```

## Use Cases

### Daily Quick Queries

```typescript
// Optimized for speed
const helpers = getAllHelpers({
  skipAnalysis: true,
  helperLevel: 'minimal',
});
```

### Weekly Review with Full Analysis

```typescript
// Comprehensive analysis
const helpers = getAllHelpers({
  skipAnalysis: false,
  performanceTracking: true,
  helperLevel: 'full',
});
```

### Debugging Performance Issues

```typescript
// Maximum observability
const helpers = getAllHelpers({
  performanceTracking: true,
  cacheStrategy: 'disabled',
});
```

### Production Deployment

```typescript
// Conservative caching for safety
const helpers = getAllHelpers({
  cacheStrategy: 'conservative',
  maxRetries: 5,
  timeout: 60000,
});
```

## Generated Configuration

Helper functions inject a `HELPER_CONFIG` constant into generated scripts:

```javascript
const HELPER_CONFIG = {
  skipAnalysis: true,
  performanceTracking: false,
  maxRetries: 3,
  timeout: 120000,
  cacheStrategy: 'aggressive',
  helperLevel: 'standard'
};
```

Scripts can reference this configuration:

```javascript
const shouldSkipAnalysis = filter.skipAnalysis !== undefined
  ? filter.skipAnalysis
  : HELPER_CONFIG.skipAnalysis;
```

## Helper Functions Updated

All major helper functions now accept optional context:

- `getAllHelpers(context?)`
- `getAllHelpersWithBridge(context?)`
- `getCoreHelpers(context?)`
- `getMinimalHelpers(context?)`
- `getFullStatusHelpers(context?)`
- `getRecurrenceHelpers(context?)`
- `getRecurrenceApplyHelpers(context?)`

## Implementation Details

### Type Safety

Context is fully typed with TypeScript:

```typescript
// Type-safe configuration
const context: HelperContext = {
  skipAnalysis: false,
  timeout: 60000,
};

const helpers = getAllHelpers(context);
```

### Merging with Defaults

The `mergeHelperContext()` function merges user options with defaults:

```typescript
import { mergeHelperContext } from './helper-context.js';

const merged = mergeHelperContext({ skipAnalysis: false });
// Result: { ...defaults, skipAnalysis: false }
```

### Configuration Generation

The `generateHelperConfig()` function creates JavaScript code:

```typescript
import { generateHelperConfig } from './helper-context.js';

const jsCode = generateHelperConfig({ performanceTracking: true });
// Returns: "const HELPER_CONFIG = { ... }"
```

## Testing

Comprehensive unit tests validate:

- ✅ Default configuration
- ✅ Partial context merging
- ✅ JavaScript code generation
- ✅ Backwards compatibility
- ✅ All helper functions accept context
- ✅ No template literal syntax errors

Run tests:

```bash
npx vitest tests/unit/helper-context.test.ts
```

## Performance Impact

- **Zero overhead when using defaults** - Configuration is compile-time
- **Negligible script size increase** - ~200 bytes for config object
- **Better cache hit rates** - Context-aware caching strategies
- **Explicit performance tuning** - Easy to optimize per use case

## Migration Guide

Existing code continues to work without changes:

```typescript
// ✅ Old code still works
const helpers = getAllHelpers();

// ✅ New code can add context
const helpers = getAllHelpers({ skipAnalysis: false });
```

No breaking changes - context is optional everywhere.

## Future Enhancements

Potential additions to HelperContext:

- **Logging level** - Control verbosity of helper logs
- **Error handling strategy** - Fail-fast vs resilient modes
- **Memory limits** - Constraints for large datasets
- **Custom validators** - User-defined validation functions

## Related Documentation

- [IMPROVEMENT_ROADMAP.md](./IMPROVEMENT_ROADMAP.md) - Roadmap entry for this feature
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall architecture patterns
- [LESSONS_LEARNED.md](./LESSONS_LEARNED.md) - Helper function history

## Implementation Timeline

- **Estimated time**: 2 hours
- **Actual time**: ~2 hours
- **Lines of code**:
  - `helper-context.ts`: 98 lines
  - `helpers.ts` updates: ~50 lines
  - Tests: 130 lines
- **Tests**: 13 unit tests, all passing

## Credits

Implemented based on insights from PR #23 and the IMPROVEMENT_ROADMAP.md analysis.
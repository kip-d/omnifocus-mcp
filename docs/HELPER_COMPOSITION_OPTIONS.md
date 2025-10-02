# Helper Composition System: Architectural Options

This document explores different approaches to preventing duplicate `HELPER_CONFIG` declarations in generated JXA scripts.

## The Problem

Scripts that combine multiple helper functions can accidentally include `HELPER_CONFIG` multiple times:

```typescript
// ❌ This creates duplicate const declarations:
export const BAD_SCRIPT = `
  ${getCoreHelpers()}          // includes HELPER_CONFIG
  ${getRecurrenceApplyHelpers()} // also includes HELPER_CONFIG
`;
```

This causes JXA syntax errors: "Cannot declare a const variable twice"

## Solution Options

### Option A: Tagged Template Literals

**Runtime validation with natural syntax**

```typescript
function script(
  strings: TemplateStringsArray, 
  ...values: Array<HelperWithConfig | HelperWithoutConfig | string>
): string {
  const configCount = values.filter(v => 
    typeof v === 'object' && v.__hasConfig === true
  ).length;
  
  if (configCount > 1) {
    throw new Error(`Script has ${configCount} HELPER_CONFIG declarations!`);
  }
  
  return strings.reduce((result, str, i) => {
    const value = values[i - 1];
    return result + (value?.code || value || '') + str;
  });
}

// Usage
export const CREATE_TASK_SCRIPT = script`
  ${getCoreHelpers()}
  ${getRecurrenceFunctions()}
  
  (() => { /* code */ })();
`;
```

**Pros:**
- Natural template literal syntax
- Runtime validation catches errors at module load time
- Clear error messages
- Works with or without TypeScript

**Cons:**
- Runtime validation only (not compile-time)
- Must remember to use `script` tag
- Slight runtime overhead

---

### Option D: Function Composition with Currying

**Compile-time safety for helpers, template literals for code**

```typescript
type ScriptComposer = (code: string) => string;

function composeScript(
  base: HelperWithConfig,
  ...additions: HelperWithoutConfig[]
): ScriptComposer {
  return (code: string) => [base, ...additions, code].join('\n');
}

// Usage
const taskHelpers = composeScript(
  getCoreHelpers(),
  getRecurrenceFunctions(),
  getTagBridge()
);

export const CREATE_TASK_SCRIPT = taskHelpers(`
  (() => {
    const taskData = {{taskData}};
    // ... logic
  })();
`);

// TypeScript prevents this at compile time:
const bad = composeScript(
  getCoreHelpers(),
  getCoreHelpers()  // ❌ TYPE ERROR
);
```

**Pros:**
- Compile-time type safety for helpers
- Template literals for script code
- Reusable helper compositions
- Catches errors during build

**Cons:**
- Two-step syntax (compose, then apply)
- Less obvious at first glance

---

### Option E: Const Assertion with Type Checking

**Maximum compile-time safety**

```typescript
type ValidScriptParts<T extends readonly unknown[]> = 
  T extends readonly [HelperWithConfig, ...HelperWithoutConfig[], string]
    ? T
    : never;

function makeScript<T extends readonly unknown[]>(
  ...parts: T & ValidScriptParts<T>
): string {
  return parts.join('\n');
}

// Usage - all type-checked!
export const CREATE_TASK_SCRIPT = makeScript(
  getCoreHelpers(),           // HelperWithConfig
  getRecurrenceFunctions(),   // HelperWithoutConfig
  getTagBridge(),             // HelperWithoutConfig
  `(() => { /* code */ })();` // string
);

// Compiler error:
const bad = makeScript(
  getCoreHelpers(),
  getCoreHelpers(),  // ❌ TYPE ERROR: must be HelperWithoutConfig
  'code'
);
```

**Pros:**
- Full compile-time safety
- Single function call
- Zero runtime overhead
- Fails at build time

**Cons:**
- Complex TypeScript (conditional types)
- Cryptic error messages
- Code is plain string (not template literal)

---

### Option 3: Module Constants (Current Tactical Fix)

**Explicit composition with constants**

```typescript
// All helpers as constants
export const CORE_FUNCTIONS = `
  function safeGet(...) { ... }
  function formatError(...) { ... }
`;

export const RECURRENCE_APPLY_FUNCTIONS = `...`;

// Scripts compose explicitly
export const CREATE_TASK_SCRIPT = `
  ${generateHelperConfig()}
  ${CORE_FUNCTIONS}
  ${RECURRENCE_APPLY_FUNCTIONS}
  
  (() => { /* code */ })();
`;
```

**Pros:**
- Maximum transparency
- Zero magic
- Grep-friendly
- Incremental migration

**Cons:**
- Manual discipline required
- No compile-time protection
- Verbose

---

## Recommendations

### For Maximum Type Safety
Use **Option E (Const Assertion)** - full compile-time checking, zero runtime overhead

### For Best Developer Experience  
Use **Option D (Function Composition)** - compile-time safety for helpers, natural syntax for code

### For Gradual Migration
Use **Option A (Tagged Template)** - minimal syntax changes, runtime validation

### For Simplicity
Use **Option 3 (Module Constants)** + runtime validator - explicit and clear

---

## Historical Context

This complexity emerged from concerns about JXA script size limits. However, empirical testing (documented in `SCRIPT_SIZE_LIMITS.md`) showed:

- **JXA limit**: 523KB (~523,000 characters)
- **Largest current script**: ~32KB
- **Actual failures**: Due to escaping issues, not size

**Key Question:** Is this composition complexity necessary if size isn't a constraint?

See `HELPER_ARCHITECTURE_SIMPLIFICATION.md` for discussion of simpler alternatives.

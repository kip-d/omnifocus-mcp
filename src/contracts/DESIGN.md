# Shared Contract System - Design

**Status:** Phase 1 approved, ready for implementation
**Detailed Plan:** See `docs/plans/2025-11-24-querycompiler-taskfilter-integration.md`

## Problem Statement

15+ bugs in git history share common patterns:
1. Filter property name mismatches between layers
2. Filter logic duplicated across modes, missing in some
3. Response structure confusion (double-unwrap saga)
4. Parameters not passed through all layers

## Goal

Catch these bugs at **compile time**, not during user testing.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SHARED CONTRACTS                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ FilterSpec   │  │ ResponseSpec │  │ ParameterSpec        │  │
│  │ (what can be │  │ (what scripts│  │ (what flows through  │  │
│  │  filtered)   │  │  return)     │  │  layers)             │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼─────────────────┼─────────────────────┼───────────────┘
          │                 │                     │
          ▼                 ▼                     ▼
   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
   │ QueryCompiler│  │ Tool Wrapper │  │ Script Generator     │
   │ (validates   │  │ (validates   │  │ (generates OmniJS    │
   │  input)      │  │  response)   │  │  from FilterSpec)    │
   └──────────────┘  └──────────────┘  └──────────────────────┘
```

## Key Insight

The OmniJS scripts are **generated strings**. We can generate them from
typed specifications instead of hand-writing and hoping names match.

---

## Files Created

1. ✅ `src/contracts/filters.ts` - Filter specification (single source of truth)
2. ✅ `src/contracts/responses.ts` - Response structure contracts
3. ✅ `src/contracts/generator.ts` - OmniJS code generator from specs
4. ✅ `src/contracts/index.ts` - Public exports
5. ✅ `src/contracts/examples/migration-example.ts` - Migration patterns

## Next: QueryCompiler Integration

See detailed plan: `docs/plans/2025-11-24-querycompiler-taskfilter-integration.md`

**Summary:** Transform `FilterValue` → `TaskFilter` in QueryCompiler to enforce type safety end-to-end.

---

## Benefits

| Bug Type | How Contract Catches It |
|----------|------------------------|
| `completed` vs `includeCompleted` | Single FilterSpec defines the name |
| Missing `matchesTagFilter` in mode | Generator includes all filters automatically |
| Double-unwrap confusion | ResponseSpec defines exact structure |
| Limit not passed through | ParameterSpec enforces all params |

## Migration Strategy

1. Create contracts alongside existing code (no breaking changes)
2. Migrate one script/tool at a time to use generated code
3. Delete hand-written duplicated logic as we go
4. Add compile-time checks that enforce contract usage

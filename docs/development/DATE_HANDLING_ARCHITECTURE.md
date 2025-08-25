# Date Handling Architecture

## Core Principle
**The LLM (Claude) is responsible for natural language date parsing, not the MCP tools.**

## Design Decision Rationale

### What We DON'T Do
- We don't implement complex natural language date parsing
- We don't try to understand "next Tuesday", "in 3 days", "end of month"
- We don't parse various date formats like "MM/DD/YYYY" or "January 15, 2025"

### What We DO Support
1. **SQL datetime format** (primary): `YYYY-MM-DD HH:mm` (e.g., "2025-03-31 17:00") - local time, no timezone
2. **SQL date format**: `YYYY-MM-DD` (e.g., "2025-03-31") - interpreted as start of day
3. **Basic convenience keywords**: "today", "tomorrow", "next week" (with sensible defaults)

**NOT SUPPORTED**: ISO-8601 with Z suffix (`2025-03-31T17:00:00Z`) - causes timezone issues with OmniFocus

### Why This Architecture?

1. **Separation of Concerns**
   - LLMs are excellent at understanding natural language
   - MCP tools should focus on OmniFocus integration, not date parsing
   - This keeps our codebase simple and maintainable

2. **Consistency**
   - Local time format avoids timezone conversion issues
   - The LLM can handle user timezone and preferences
   - We avoid complex timezone and locale issues

3. **Reliability**
   - Date parsing is notoriously error-prone
   - LLMs have extensive training on date/time understanding
   - OmniFocus provides a fallback parser if needed

## Implementation Details

### Input Normalization
```typescript
// In src/utils/response-format-v2.ts
export function normalizeDateInput(input: string | Date | null | undefined): Date | null {
  // Handle Date objects
  if (input instanceof Date) return input;
  
  // Handle local time format (YYYY-MM-DD HH:mm)
  // We let JavaScript's Date constructor handle it
  // AVOID: ISO-8601 with Z suffix
  
  // Handle basic keywords only
  switch (input?.toLowerCase()) {
    case 'today': return setToDefaultTime(new Date());
    case 'tomorrow': return setToDefaultTime(addDays(new Date(), 1));
    // ... minimal set of convenience cases
  }
  
  // Try to parse as date
  const parsed = new Date(input);
  return isNaN(parsed.getTime()) ? null : parsed;
}
```

### Testing Strategy
- Test that we correctly handle local time format (YYYY-MM-DD HH:mm)
- Test our basic keyword support
- **DON'T test natural language parsing we don't implement**
- Keep skipped tests as documentation of non-features

### Tool Descriptions
All date parameters should indicate local time format is expected:
```typescript
dueDate: z.string()
  .optional()
  .describe('Due date in local time format (e.g., "2025-03-31 17:00")')
```

## Examples

### Good Flow
1. User: "Create a task due next Tuesday at 3pm"
2. Claude: Parses "next Tuesday at 3pm" → "2025-11-05 15:00"
3. MCP Tool: Receives local time string, creates Date object
4. OmniFocus: Receives properly formatted date

### Fallback Flow
1. User provides ambiguous date directly to tool
2. MCP Tool: Passes string through unchanged
3. OmniFocus: Uses its own parser (may succeed or fail)

## Migration Notes
- Previous versions attempted more date parsing
- Tests were updated to reflect this architectural decision
- Skipped tests now explicitly state "should NOT handle" to document non-features
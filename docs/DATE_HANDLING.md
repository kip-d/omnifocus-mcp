# Date Handling in OmniFocus MCP

## Executive Summary

The OmniFocus MCP bridge handles dates in **local time** for user input and converts them to UTC for OmniFocus storage. This document outlines the current implementation, known issues, and best practices.

## Current Implementation

### Date Input Formats

#### For Creating/Updating Tasks and Projects
- **Format**: `YYYY-MM-DD` or `YYYY-MM-DD HH:mm`
- **Schema**: `LocalDateTimeSchema`
- **Examples**:
  - `"2024-01-15"` - January 15, 2024 at midnight local time
  - `"2024-01-15 14:30"` - January 15, 2024 at 2:30 PM local time
- **Conversion**: Automatically converted to UTC via `localToUTC()`

#### For Querying/Filtering
- **Format**: ISO 8601 with optional Z suffix
- **Schema**: `DateTimeSchema`
- **Examples**:
  - `"2024-01-15T14:30:00Z"` - UTC time (recommended)
  - `"2024-01-15T14:30:00"` - Ambiguous (avoid)
- **Note**: This inconsistency is a known issue

### Date Processing Flow

1. **User Input** → LocalDateTimeSchema validation
2. **Conversion** → `localToUTC()` converts to ISO string
3. **Storage** → OmniFocus stores in UTC
4. **Retrieval** → Dates returned as ISO strings
5. **Display** → `utcToLocal()` converts back for display

## Known Issues

### 1. JavaScript Date Constructor Ambiguity

The `new Date()` constructor interprets strings inconsistently:

```javascript
new Date("2024-01-15")           // UTC midnight ❌
new Date("2024-01-15T00:00:00")  // Local midnight ✅
new Date("2024-01-15 00:00:00")  // Local midnight ✅
new Date("2024-01-15T00:00:00Z") // UTC midnight ✅
```

**Current Issue**: Date-only inputs are incorrectly treated as UTC instead of local time.

### 2. API Inconsistency

- **Creation/Update**: Expects local time format (`LocalDateTimeSchema`)
- **Queries**: Expects ISO format (`DateTimeSchema`)

This forces users to use different date formats for different operations.

### 3. Timezone Detection

The system timezone detection may fail, defaulting to UTC, which can cause:
- Tasks appearing on the wrong day
- Due times being off by several hours

### 4. Missing Timezone Context in JXA

JXA scripts run in OmniFocus's context, which may have different timezone settings than the Node.js process.

## Best Practices

### For Users

#### Creating Tasks
```javascript
// ✅ GOOD - Local time format
create_task({
  name: "Meeting",
  dueDate: "2024-01-15 14:30"  // 2:30 PM local time
})

// ❌ BAD - ISO format with Z
create_task({
  name: "Meeting",
  dueDate: "2024-01-15T14:30:00Z"  // Will be misinterpreted
})
```

#### Querying Tasks
```javascript
// ✅ GOOD - ISO format with Z for queries
list_tasks({
  dueBefore: "2024-01-15T23:59:59Z"
})

// ⚠️ RISKY - ISO without Z (ambiguous)
list_tasks({
  dueBefore: "2024-01-15T23:59:59"  // Unclear if UTC or local
})
```

### For Developers

#### Handling Date Input
```typescript
// Always use LocalDateTimeSchema for user input
const schema = z.object({
  dueDate: LocalDateTimeSchema.optional()
});

// Convert to UTC before sending to OmniFocus
const utcDate = localToUTC(userInput.dueDate);
```

#### Handling Date Output
```typescript
// Dates from OmniFocus are in UTC ISO format
const localDisplay = utcToLocal(task.dueDate, 'datetime');
```

## Recommendations for Improvement

### High Priority

1. **Fix Date-Only Handling**: Treat `YYYY-MM-DD` as local midnight, not UTC
2. **Unify Date Formats**: Use LocalDateTimeSchema for all user-facing operations
3. **Improve Timezone Detection**: Add fallback methods and validation
4. **Add Clear Documentation**: Include timezone info in all date-related error messages

### Medium Priority

5. **Add Date Format Validation**: Reject ambiguous formats
6. **Implement Relative Dates**: Support "tomorrow", "next Monday", etc.
7. **Add Timezone Override**: Allow users to specify timezone explicitly

### Low Priority

8. **Consider Date Libraries**: Use moment.js or date-fns for robust handling
9. **Add Date Format Preferences**: Let users choose their preferred format
10. **Implement Date Parsing Tests**: Comprehensive edge case testing

## Common Scenarios

### Scenario 1: Daily Task at Specific Time
```javascript
// User in EST wants task due at 3 PM
create_task({
  name: "Daily standup",
  dueDate: "2024-01-15 15:00"  // Correctly interprets as 3 PM EST
})
```

### Scenario 2: All-Day Task
```javascript
// User wants task due "sometime on January 15"
create_task({
  name: "Submit report",
  dueDate: "2024-01-15"  // Currently broken - treats as UTC midnight
  // Should be: "2024-01-15 00:00" for local midnight
})
```

### Scenario 3: Query Today's Tasks
```javascript
// Get all tasks due today (in user's timezone)
const today = new Date();
today.setHours(0, 0, 0, 0);
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);

list_tasks({
  dueAfter: today.toISOString(),
  dueBefore: tomorrow.toISOString()
})
```

## Testing Dates

### Quick Test Commands

```bash
# Test timezone detection
node -e "const {getTimezoneInfo} = require('./dist/utils/timezone.js'); console.log(getTimezoneInfo())"

# Test date conversion
node -e "const {localToUTC} = require('./dist/utils/timezone.js'); console.log(localToUTC('2024-01-15 14:30'))"

# Test date parsing
node -e "const {parseFlexibleDate} = require('./dist/utils/timezone.js'); console.log(parseFlexibleDate('2024-01-15'))"
```

## Summary

Date handling in OmniFocus MCP is functional but has several inconsistencies that can lead to confusion. The main issues are:

1. **Format inconsistency** between creation and querying
2. **Date-only ambiguity** in JavaScript Date constructor
3. **Timezone detection** reliability

Following the best practices above will minimize issues, but the system would benefit from the recommended improvements to provide a more robust and consistent date handling experience.
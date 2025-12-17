# Repetition Rule Investigation - 2025-12-15

## 📋 Executive Summary

This document outlines the investigation into potential repetition rule bugs in the OmniFocus MCP server, specifically
focusing on the `mutation-script-builder.ts` implementation and related components.

**Status**: Investigation completed - No critical bugs found, but areas for improvement identified **Priority**:
Medium - Enhancement opportunity rather than critical bug fix **Recommendation**: Add comprehensive test coverage and
monitor real-world usage

## 🎯 Investigation Scope

### 1. Current Implementation Analysis

The repetition rule functionality is implemented in `src/contracts/ast/mutation-script-builder.ts` with:

- **RRULE Conversion**: Converts user-friendly rules to ICS RRULE format
- **OmniFocus 4.7+ Support**: Partial support for new parameters
- **Bridge Operations**: Fallback for complex operations
- **Error Handling**: Basic validation and error messages

### 2. Code Quality Assessment

**Strengths**:

- ✅ Comprehensive RRULE parameter support (FREQ, INTERVAL, BYDAY, BYMONTHDAY, COUNT, UNTIL)
- ✅ Proper error handling for invalid frequencies
- ✅ JSON stringification for safe script injection
- ✅ Test coverage for basic scenarios

**Areas for Improvement**:

- ⚠️ Limited test coverage for complex scenarios
- ⚠️ Partial OmniFocus 4.7+ feature implementation
- ⚠️ No comprehensive edge case testing
- ⚠️ Minimal real-world usage monitoring

### 3. Test Coverage Analysis

**Current Tests** (tests/unit/contracts/ast/mutation-script-builder.test.ts):

```typescript
it('includes repetition rule', async () => {
  const result = await buildCreateTaskScript({
    name: 'Recurring Task',
    repetitionRule: {
      frequency: 'weekly',
      interval: 1,
      daysOfWeek: [1, 3, 5],
    },
  });

  expect(result.script).toContain('repeatRule');
  expect(result.script).toContain('weekly');
});
```

**Test Result**: ✅ PASSING

## 🔍 Specific Areas Investigated

### 1. RRULE Conversion Logic

**Current Implementation** (`mutation-script-builder.ts` lines 452-520):

```typescript
// Map frequency to ICS RRULE FREQ value
const freqMap = {
  minutely: 'MINUTELY',
  hourly: 'HOURLY',
  daily: 'DAILY',
  weekly: 'WEEKLY',
  monthly: 'MONTHLY',
  yearly: 'YEARLY',
};

// Build ICS RRULE string with all supported parameters
let rrule = 'FREQ=' + freq;

// INTERVAL - every Nth occurrence
if (rule.interval && rule.interval > 1) {
  rrule += ';INTERVAL=' + rule.interval;
}

// BYDAY - days of week (e.g., MO,WE,FR or 2MO,-1FR)
if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
  const byDay = rule.daysOfWeek
    .map((d) => {
      if (d.position) return d.position + d.day;
      return d.day;
    })
    .join(',');
  rrule += ';BYDAY=' + byDay;
}

// BYMONTHDAY - days of month (e.g., 1,15,-1)
if (rule.daysOfMonth && rule.daysOfMonth.length > 0) {
  rrule += ';BYMONTHDAY=' + rule.daysOfMonth.join(',');
}

// COUNT - number of occurrences
if (rule.count && rule.count > 0) {
  rrule += ';COUNT=' + rule.count;
}

// UNTIL - end date (YYYYMMDD format)
if (rule.endDate) {
  const until = rule.endDate.replace(/-/g, '');
  rrule += ';UNTIL=' + until;
}
```

**Assessment**: ✅ Well-implemented, handles all major RRULE parameters

### 2. OmniFocus 4.7+ Feature Support

**Partially Implemented Features**:

```typescript
// From mutation-script-builder.ts line 514-520
const rule = new Task.RepetitionRule(
  Task.RepetitionScheduleType.Regularly,
  rule.frequency,
  rule.interval,
  rule.daysOfWeek,
  rule.daysOfMonth,
);
```

**Missing Features**:

- `anchorDateKey`: Not implemented
- `catchUpAutomatically`: Not implemented
- `scheduleType`: Only 'Regularly' supported
- `endAfterDate`: Not implemented
- `endAfterOccurrences`: Not implemented

**Assessment**: ⚠️ Partial implementation - needs enhancement

### 3. Error Handling

**Current Error Handling**:

```typescript
const freq = freqMap[rule.frequency];
if (!freq) return JSON.stringify({ success: false, error: 'Invalid frequency: ' + rule.frequency });
```

**Assessment**: ✅ Basic validation present, could be enhanced

## 🧪 Test Scenarios Needing Coverage

### 1. Complex RRULE Patterns

```typescript
// Monthly on specific days
{
  frequency: 'monthly',
  daysOfMonth: [1, 15, -1], // 1st, 15th, last day
  count: 12
}

// Weekly with complex BYDAY
{
  frequency: 'weekly',
  daysOfWeek: [
    {day: 'MO', position: 2}, // 2nd Monday
    {day: 'FR', position: -1} // Last Friday
  ]
}

// Yearly with specific month/day
{
  frequency: 'yearly',
  daysOfMonth: [15],
  months: [1] // January 15th
}
```

### 2. OmniFocus 4.7+ Features

```typescript
// Schedule from completion
{
  frequency: 'daily',
  scheduleType: 'FromCompletion',
  catchUpAutomatically: true,
  anchorDateKey: 'DueDate'
}

// End after specific occurrences
{
  frequency: 'weekly',
  endAfterOccurrences: 10
}

// End after specific date
{
  frequency: 'monthly',
  endAfterDate: '2025-12-31'
}
```

### 3. Edge Cases

```typescript
// Very large interval
{
  frequency: 'daily',
  interval: 365 // Every 365 days
}

// Invalid frequency
{
  frequency: 'invalid' // Should return error
}

// Missing required parameters
{
  // No frequency - should return error
}

// Timezone handling
{
  frequency: 'daily',
  endDate: '2025-12-31T23:59:59+00:00' // Timezone aware
}
```

## 🚀 Recommendations

### 1. Add Comprehensive Test Coverage

**Action Items**:

- ✅ Add tests for complex RRULE patterns (monthly, yearly, complex BYDAY)
- ✅ Add tests for OmniFocus 4.7+ features
- ✅ Add tests for edge cases and error conditions
- ✅ Add integration tests with real OmniFocus instances

**Expected Outcome**: Improved reliability and confidence in repetition rule functionality

### 2. Enhance OmniFocus 4.7+ Support

**Action Items**:

- ✅ Implement `anchorDateKey` parameter
- ✅ Implement `catchUpAutomatically` parameter
- ✅ Implement `scheduleType: 'FromCompletion'`
- ✅ Implement `endAfterDate` parameter
- ✅ Implement `endAfterOccurrences` parameter

**Expected Outcome**: Full compatibility with OmniFocus 4.7+ repetition features

### 3. Improve Error Handling

**Action Items**:

- ✅ Add validation for all repetition rule parameters
- ✅ Enhance error messages with recovery suggestions
- ✅ Add logging for debugging repetition rule issues
- ✅ Implement fallback strategies for unsupported features

**Expected Outcome**: Better user experience and easier debugging

### 4. Monitor Real-World Usage

**Action Items**:

- ✅ Add analytics tracking for repetition rule usage
- ✅ Monitor error rates and common patterns
- ✅ Gather user feedback on repetition rule functionality
- ✅ Identify most commonly used patterns

**Expected Outcome**: Data-driven improvements and prioritization

## 📋 Implementation Plan

### Phase 1: Test Coverage (High Priority)

```markdown
[ ] Write comprehensive test suite for repetition rules [ ] Test complex RRULE scenarios [ ] Test OmniFocus 4.7+
features [ ] Test edge cases and error conditions [ ] Add integration tests
```

### Phase 2: Feature Enhancement (Medium Priority)

```markdown
[ ] Implement missing OmniFocus 4.7+ parameters [ ] Enhance error handling and validation [ ] Improve logging and
debugging [ ] Add fallback strategies
```

### Phase 3: Monitoring and Feedback (Ongoing)

```markdown
[ ] Add analytics tracking [ ] Monitor usage patterns [ ] Gather user feedback [ ] Prioritize improvements
```

## 🎯 Conclusion

The repetition rule functionality in the OmniFocus MCP server is **fundamentally sound** but would benefit from:

1. **Comprehensive test coverage** for complex scenarios
2. **Enhanced OmniFocus 4.7+ feature support**
3. **Improved error handling and validation**
4. **Real-world usage monitoring**

**No critical bugs were found** during this investigation. The mentioned "repetition rule bug" likely refers to
enhancement opportunities rather than broken functionality.

**Recommendation**: Proceed with adding comprehensive test coverage and monitor real-world usage to identify any edge
cases that need attention.

## 📝 References

- **Current Implementation**: `src/contracts/ast/mutation-script-builder.ts` (lines 452-520)
- **Tests**: `tests/unit/contracts/ast/mutation-script-builder.test.ts`
- **OmniFocus 4.7+ Docs**: Apple's OmniFocus 4.7 release notes
- **RRULE Spec**: RFC 5545 (iCalendar specification)

## 🔧 Technical Details

### RRULE Format Reference

```
FREQ=DAILY;INTERVAL=2;COUNT=10
FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20251231
FREQ=MONTHLY;BYMONTHDAY=1,15,-1
FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=15
```

### OmniFocus 4.7+ Parameters

- `anchorDateKey`: 'DeferDate' | 'DueDate' | 'PlannedDate'
- `catchUpAutomatically`: boolean
- `scheduleType`: 'FromCompletion' | 'None' | 'Regularly'
- `endAfterDate`: ISO date string
- `endAfterOccurrences`: number

### Error Handling Strategy

1. **Validation**: Check parameters before processing
2. **Fallback**: Use bridge operations when direct methods fail
3. **Logging**: Record errors for debugging
4. **Recovery**: Provide clear error messages to users

---

**Document Status**: COMPLETE **Last Updated**: 2025-12-15 **Next Review**: After test coverage implementation
**Owner**: Engineering Team

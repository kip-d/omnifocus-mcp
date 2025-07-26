# Understanding null vs missing value in JXA

## The Core Issue

When working with JXA (JavaScript for Automation) and OmniFocus, there's a fundamental mismatch between how JavaScript and AppleScript handle "no value":

- **JavaScript**: Uses `null` and `undefined`
- **AppleScript**: Uses `missing value`
- **JXA Bridge**: Attempts to translate between them, with mixed results

## Why `{dueDate: {_not: null}}` Fails

Even though the syntax seems logical, it fails because:

1. **Type System Mismatch**: OmniFocus internally uses AppleScript's `missing value` for tasks without due dates
2. **Bridge Translation Issues**: The JXA bridge doesn't consistently translate between `null` and `missing value`
3. **Operator Limitations**: The `_not` operator may not be implemented for null/missing value comparisons

## What Actually Happens

```javascript
// When you check a task without a due date:
task.dueDate()  // Returns null in JavaScript

// But internally in OmniFocus:
// The dueDate property is "missing value" (AppleScript concept)

// When you try:
doc.flattenedTasks.whose({dueDate: {_not: null}})()
// The bridge tries to compare "missing value" with JavaScript null
// This comparison is undefined behavior, leading to "Illegal comparison or logical"
```

## The Asymmetry

Interestingly, checking FOR null works:
```javascript
doc.flattenedTasks.whose({dueDate: null})()  // ✅ Works
```

But checking for NOT null fails:
```javascript
doc.flattenedTasks.whose({dueDate: {_not: null}})()  // ❌ Fails
```

This asymmetry exists because:
- Direct null comparison (`==`) has special handling in the bridge
- Operator-based comparisons (`_not`) go through different code paths
- The bridge can translate `null` → `missing value` for equality, but not for operators

## Real-World Implications

This explains why OmniFocus automation scripts often:
1. Iterate through all items rather than using complex `whose()` queries
2. Check for null after retrieving items rather than in the query
3. Use workarounds like extreme date ranges instead of null checks

## Example Workarounds

```javascript
// ❌ What we want but can't do:
const tasksWithDates = doc.flattenedTasks.whose({dueDate: {_not: null}})();

// ✅ Workaround 1: Get all and filter
const allTasks = doc.flattenedTasks();
const tasksWithDates = allTasks.filter(task => task.dueDate() !== null);

// ✅ Workaround 2: Use date range (imperfect)
const veryOldDate = new Date('1900-01-01');
const veryFutureDate = new Date('2100-01-01');
const tasksWithDates = doc.flattenedTasks.whose({
  dueDate: {'>': veryOldDate},
  dueDate: {'<': veryFutureDate}
})();

// ✅ Workaround 3: Inverse selection
const tasksWithoutDates = doc.flattenedTasks.whose({dueDate: null})();
// Then manually subtract from all tasks (inefficient)
```

## The Deeper Lesson

This issue illustrates why JXA, despite being "JavaScript", requires deep understanding of the underlying AppleScript object model. The abstraction is leaky, and assumptions from pure JavaScript don't always hold.

Key takeaways:
1. **JXA is not just JavaScript** - it's JavaScript talking to AppleScript
2. **Type systems matter** - mismatches cause subtle bugs
3. **Test everything** - behavior that seems logical may not work
4. **Have fallbacks** - robust code needs workarounds for bridge limitations

## Historical Context

This limitation has existed since JXA was introduced in OS X Yosemite (10.10) and remains unfixed. It's not a bug per se, but rather a fundamental challenge in bridging two different type systems and runtime environments.

The fact that even Apple's own documentation and examples often avoid complex `whose()` queries suggests this is a known limitation that won't be resolved soon.
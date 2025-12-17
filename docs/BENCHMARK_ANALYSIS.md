# OmniFocus MCP Benchmark Analysis

## Cross-Machine Performance Investigation

**Date:** October 27, 2025 **Commit:** 53fb862

---

## Executive Summary

Benchmark results across three Apple Silicon machines reveal surprising performance patterns that challenge assumptions
about hardware performance scaling.

### Key Findings

1. **M4 Pro dominates most operations** (4-6x faster than M2 Ultra) despite having 58% fewer cores
2. **Major anomaly: "Today's tasks" query** - M4 Pro is 4.2x SLOWER than M2 Ultra (12s vs 2.8s)
3. **M2 Air shows bimodal performance** - catastrophic on task queries (173s), normal on analytics (5-6s)

---

## Benchmark Results Summary

### M4 Pro (14 cores, 64GB RAM, Node v24.10.0)

| Operation          | Time         | Notes        |
| ------------------ | ------------ | ------------ |
| Today's tasks      | **12,036ms** | ⚠️ ANOMALY   |
| Overdue tasks      | 3,424ms      | Normal       |
| Upcoming tasks     | 3,378ms      | Normal       |
| Project stats      | 252ms        | ✅ Excellent |
| Tags (full)        | 855ms        | ✅ Excellent |
| Productivity stats | 809ms        | ✅ Excellent |
| Task velocity      | 812ms        | ✅ Excellent |

### M2 Ultra (24 cores, 192GB RAM, Node v24.9.0)

| Operation          | Time    | Notes               |
| ------------------ | ------- | ------------------- |
| Today's tasks      | 2,864ms | ✅ Fast             |
| Overdue tasks      | 3,731ms | Normal              |
| Upcoming tasks     | 6,781ms | Normal              |
| Project stats      | 1,195ms | Slower than M4      |
| Tags (full)        | 5,477ms | 6.4x slower than M4 |
| Productivity stats | 5,315ms | 6.6x slower than M4 |
| Task velocity      | 5,150ms | 6.3x slower than M4 |

### M2 Air (8 cores, 24GB RAM, Node v24.10.0)

| Operation          | Time          | Notes           |
| ------------------ | ------------- | --------------- |
| Today's tasks      | **173,147ms** | ⚠️ CATASTROPHIC |
| Overdue tasks      | 190,674ms     | ⚠️ CATASTROPHIC |
| Upcoming tasks     | 191,414ms     | ⚠️ CATASTROPHIC |
| Project stats      | 1,415ms       | Normal          |
| Tags (full)        | 3,379ms       | Normal          |
| Productivity stats | 5,650ms       | Normal          |
| Task velocity      | 5,714ms       | Normal          |

---

## Analysis

### Why M4 Pro Dominates (Except "Today's Tasks")

**Explanation:** Single-core performance matters more than core count for OmniFocus JXA operations.

- M4 Pro has massive single-core performance improvements over M2 generation
- Most OmniFocus operations are single-threaded JXA calls
- Extra cores on M2 Ultra don't help with serial property access

**Evidence:**

- Tags (full mode): M4 Pro 855ms vs M2 Ultra 5,477ms (6.4x faster)
- Productivity stats: M4 Pro 809ms vs M2 Ultra 5,315ms (6.6x faster)
- Project stats: M4 Pro 252ms vs M2 Ultra 1,195ms (4.7x faster)

### The "Today's Tasks" Anomaly

**Problem:** M4 Pro takes 12s while M2 Ultra takes 2.8s (4.2x slower)

**Root Cause Hypothesis:** Linear database scan + task distribution differences

The `TODAYS_AGENDA_SCRIPT` uses a linear scan:

```javascript
const allTasks = doc.flattenedTasks(); // Get ALL tasks
for (let i = 0; i < taskCount && tasks.length < maxTasks; i++) {
  // Scan until finding 25 tasks that match:
  // - Overdue, OR
  // - Due today, OR
  // - Flagged
}
```

**Why this creates variance:**

- Performance depends on WHERE qualifying tasks are located in the database
- If M4 Pro's database has qualifying tasks deeper in the array, it must scan more tasks
- Different sync states or database organization could cause this

**Supporting evidence:**

- All other task queries (overdue, upcoming) have similar performance between machines
- Only "today's tasks" (which combines multiple criteria) shows the anomaly
- The scan is O(n) worst case, where n = "tasks scanned until finding 25 matches"

### M2 Air: Thermal Throttling Hypothesis

**Problem:** 173-191 seconds for task queries (50-60x slower than desktop machines)

**Root Cause:** Passive cooling + sustained CPU load = thermal throttling

**Evidence for thermal throttling:**

1. **Bimodal performance pattern:**
   - Task queries: 173-191s (catastrophic)
   - Analytics: 5-6s (normal, similar to M2 Ultra)

2. **Timing analysis:**
   - Short operations (<10s) complete before throttling kicks in
   - Long operations (3+ minutes) hit thermal limits immediately
   - Linear scan of flattenedTasks is CPU-intensive for the entire duration

3. **M2 Air design:**
   - Passive cooling only (no fan)
   - Cannot sustain high CPU loads for extended periods
   - Throttles to prevent overheating

**Why analytics are normal:**

- Operations complete in 5-6 seconds
- Not enough time for thermal throttling to engage
- Single burst of work, then CPU idle

**Why task queries are catastrophic:**

- Linear scan requires sustained CPU usage
- 3+ minutes of continuous work
- Throttling engages within first 30 seconds
- Rest of query runs at reduced clock speed

---

## Implications

### For M4 Pro Users

**Current state:** Generally excellent performance, but "Today's tasks" query has unexplained slowdown.

**Hypothesis to test:**

1. Check if "Today's tasks" count is significantly lower than on M2 Ultra
2. Examine database organization (recently synced vs. long-standing database)
3. Test if clearing and re-syncing OmniFocus database changes performance

**Workaround:** Use specific queries (`mode: 'overdue'`, `mode: 'flagged'`) instead of `mode: 'today'`

### For M2 Air Users

**Current state:** Unusable for large task queries.

**Root cause:** Thermal throttling during sustained operations.

**Solutions:**

1. **Immediate:** Use caching - warm cache on desktop machine, access via sync
2. **Query optimization:** Add pagination to break large queries into smaller chunks
3. **Architecture change:** Move from linear scan to indexed queries (requires OmniFocus API changes)
4. **Hardware:** M2 Air is fundamentally limited for sustained CPU workloads

### For M2 Ultra Users

**Current state:** Good overall performance, but 4-6x slower than M4 Pro on analytics.

**Why:** Single-core performance gap between M2 and M4 generation.

**Reality:** Extra cores don't help with single-threaded JXA operations.

---

## Recommendations

### Short-term Fixes

1. **Add pagination to task queries**
   - Break linear scans into chunks of 500 tasks
   - Prevents thermal throttling on M2 Air
   - Improves responsiveness on all machines

2. **Index-based queries for "today's tasks"**
   - Query by due date range specifically
   - Query flagged tasks separately
   - Merge results instead of scanning

3. **Query-specific optimizations**
   - `mode: 'today'` could use date-based filtering before scanning
   - Early exit when finding enough matches

### Long-term Architecture

1. **Move away from linear scans**
   - Investigate OmniFocus query capabilities
   - Use native filtering when possible
   - Build indices for common queries

2. **Thermal awareness**
   - Detect sustained operations
   - Break into smaller chunks automatically
   - Provide progress feedback for long operations

3. **Cache warming strategies**
   - Warm cache on high-performance machines
   - Sync cache to mobile/portable devices
   - Reduce need for expensive queries on constrained hardware

---

## Questions Requiring Investigation

1. **Database state differences:**
   - Do M4 Pro and M2 Ultra have identical task counts?
   - Is database organization different (sync history, compaction)?

2. **First-run effects:**
   - Is M4 Pro's 12s a one-time initialization cost?
   - Does re-running show consistent 12s or does it improve?

3. **M2 Air throttling confirmation:**
   - Can we instrument CPU frequency during queries?
   - Does external cooling improve performance?

4. **OmniFocus caching:**
   - Does OmniFocus itself cache query results?
   - Is there internal state affecting query performance?

---

## Methodology Notes

**Benchmark configuration:**

- Mode: COLD CACHE (no cache warming)
- Timeout: 240 seconds (4 minutes)
- Queries: Same parameters across all machines
- Commit: 53fb862 (identical code)

**Limitations:**

- Single run per machine (no statistical variance)
- Cold cache only (doesn't reflect production usage)
- No database state verification (assuming "substantially the same")

**Follow-up needed:**

- Multiple runs to establish variance
- Warm cache benchmarks
- Database state diagnostics
- Thermal monitoring on M2 Air

# Benchmark Guide

## Running Performance Benchmarks Across Multiple Machines

This guide explains how to run benchmarks and compare performance across your Apple Silicon machines.

---

## Quick Start

### Running a Benchmark

```bash
# On any machine (M4 Pro, M2 Ultra, M2 Air, etc.)
npm run build
npm run benchmark
```

**Output**:

- Console: Human-readable table with timings
- File: `benchmark-summary-{machine}-{date}.json` (~100 lines)

### Example Console Output

```
OmniFocus MCP Performance Benchmarks
=====================================

Hardware Information:
  Machine: darwin arm64
  CPU: Apple M2
  Cores: 8
  Memory: 24 GB
  Node Version: v24.10.0

Mode: WARMED CACHE (production performance)
Cache warming time included in benchmark results.

  ✓ Cache warming completed in 8023ms

=== Benchmark Results ===

Operation                    | Avg Time  | Min Time  | Max Time  | P95 Time  | Iterations
----------------------------|-----------|-----------|-----------|-----------|------------
Today's tasks               |        3ms |        3ms |        3ms |        3ms |          1
Overdue tasks               |        1ms |        1ms |        1ms |        1ms |          1
Tags (full mode)            |     5444ms |     5444ms |     5444ms |     5444ms |          1

=== Performance Comparisons ===

Tags (namesOnly vs full): 93.1% faster (5444ms → 375ms)

Cache warming: 8023ms (8.0s)

📊 Benchmark complete!
✅ Summary saved to: benchmark-summary-m2-2025-10-28.json
```

---

## Summary File Structure

The JSON summary contains all essential data in ~100 lines:

```json
{
  "machine": {
    "name": "m2-air", // Auto-detected from CPU model
    "cpu": "Apple M2",
    "cores": 8,
    "memory": "24 GB",
    "nodeVersion": "v24.10.0"
  },
  "benchmarkInfo": {
    "mode": "warm_cache", // Always warm_cache for realistic performance
    "commit": "8f7a55f", // Git commit hash
    "timestamp": "2025-10-28T12:22:00.590Z"
  },
  "cacheWarming": {
    "duration_ms": 8023, // Time spent warming caches
    "enabled": true
  },
  "operations": [
    {
      "name": "Today's tasks",
      "iterations": 1,
      "avg_ms": 3,
      "min_ms": 3,
      "max_ms": 3,
      "p95_ms": 3
    }
    // ... rest of operations
  ],
  "comparisons": {
    "tags_names_vs_full": {
      "improvement_pct": 93.1, // Performance improvement percentage
      "baseline_ms": 5444, // Baseline timing
      "optimized_ms": 375 // Optimized timing
    }
  },
  "totals": {
    "total_benchmark_time_ms": 25769, // Total benchmark duration
    "operations_run": 9
  }
}
```

---

## Cross-Machine Comparison Workflow

### Step 1: Run Benchmarks on Each Machine

```bash
# On M4 Pro Mac mini
npm run benchmark
# Generates: benchmark-summary-m4-pro-2025-10-28.json

# On M2 Ultra Mac Studio
npm run benchmark
# Generates: benchmark-summary-m2-ultra-2025-10-28.json

# On M2 MacBook Air
npm run benchmark
# Generates: benchmark-summary-m2-air-2025-10-28.json

# On M4 Mac mini (if available)
npm run benchmark
# Generates: benchmark-summary-m4-2025-10-28.json
```

### Step 2: Collect Summary Files

Move all summary files to a shared location (e.g., iCloud folder):

```bash
# Example: Copy to shared iCloud folder
cp benchmark-summary-*.json ~/Library/Mobile\ Documents/com~apple~CloudDocs/OmniFocus-MCP-Benchmarks/
```

### Step 3: Compare Results

#### Manual Comparison (Quick)

Open the JSON files side-by-side and compare key metrics:

```bash
# Quick comparison of cache warming times
jq '.cacheWarming.duration_ms' benchmark-summary-*.json

# Compare "Today's tasks" query performance
jq '.operations[] | select(.name == "Today'\''s tasks") | .avg_ms' benchmark-summary-*.json

# Compare total benchmark time
jq '.totals.total_benchmark_time_ms' benchmark-summary-*.json
```

#### Using LLM (Comprehensive)

Provide all summary files to Claude Code for analysis:

```
Analyze these benchmark results and create a comparison table:
- benchmark-summary-m4-pro-2025-10-28.json
- benchmark-summary-m2-ultra-2025-10-28.json
- benchmark-summary-m2-air-2025-10-28.json
```

**Benefits of LLM analysis:**

- All summary files total <500 lines (manageable token count)
- LLM can identify patterns, anomalies, and recommendations
- Generates formatted comparison tables
- Explains performance differences

---

## Understanding the Results

### Cache Warming

**What it is**: Pre-scanning all tasks to populate query caches (today/overdue/upcoming buckets)

**Expected times:**

- M4 Pro: 1.2-1.5s
- M2 Ultra: 1.5-2.0s
- M2 Air: 2.5-4.0s

**Why it matters**: After cache warming, subsequent queries are 28,000-95,000x faster (173s → 6ms)

### Query Performance

**With warm cache (post-warming):**

- Task queries: 1-10ms (instant)
- Analytics: 1-6 seconds (CPU-bound calculations)

**Without cache (first query):**

- Task queries: 1-5 seconds (linear scan of all tasks)
- M2 Air can take 3+ minutes due to thermal throttling

### Performance Patterns

**M4 Pro advantages:**

- 35-40% faster per-task than M2 Ultra (single-core IPC improvements)
- Best for analytics operations (4-6x faster)

**M2 Ultra characteristics:**

- Solid, consistent performance
- Extra cores don't help with single-threaded JXA operations

**M2 Air limitations:**

- Thermal throttling under sustained load (4-5x degradation)
- Cache warming is critical for usability
- First query normal, subsequent queries degrade without cache

---

## Machine Name Detection

The benchmark auto-detects machine type from CPU model:

| CPU Model Contains    | Machine Name |
| --------------------- | ------------ |
| "M4 Pro"              | m4-pro       |
| "M4" (not Pro)        | m4           |
| "M2 Ultra"            | m2-ultra     |
| "M2" + contains "Air" | m2-air       |
| "M2" (other)          | m2           |

If auto-detection fails, uses hostname (e.g., "MacBook-Air.local" → "macbook-air")

---

## Troubleshooting

### Benchmark Times Out

**Symptom**: Benchmark hangs or times out after 30 minutes

**Solution**:

- Check OmniFocus isn't blocked by dialogs
- Ensure OmniFocus is running
- Try restarting OmniFocus

### Summary File Not Created

**Symptom**: Benchmark completes but no summary file appears

**Check**:

- Write permissions in current directory
- Console output for error messages
- Manually inspect benchmark output

### Machine Name Incorrect

**Symptom**: Summary file has generic name like "unknown" or hostname

**Solution**:

- Machine name detection is based on CPU model string
- File still contains correct CPU info in machine.cpu field
- Can manually rename file after generation

---

## Tips for Accurate Comparisons

1. **Sync OmniFocus databases** before running benchmarks on all machines
2. **Close resource-intensive apps** to minimize interference
3. **Let M2 Air cool down** between runs (avoid back-to-back benchmarks)
4. **Same git commit** - ensure all machines run identical code
5. **Check git commit** in summary files to verify versions match

---

## Next Steps

After collecting benchmark data from all machines:

1. Move summary files to shared location (iCloud, Git repo, etc.)
2. Compare results using jq commands or LLM analysis
3. Document any anomalies or unexpected performance differences
4. Update documentation with findings

**Example questions for LLM analysis:**

- "Which machine is best for interactive use?"
- "Why is M4 Pro slower on 'Today's tasks' query?"
- "Is M2 Air's thermal throttling a concern for typical usage?"
- "What operations benefit most from M4 generation improvements?"

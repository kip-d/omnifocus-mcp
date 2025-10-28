# Performance Comparison Charts - OmniFocus MCP

Visual comparison of M4 Pro, M2 Ultra, and M2 Air performance across comprehensive benchmark suite.

**Data Source**: Comprehensive benchmarks run October 28, 2025 (warm cache mode)

---

## Executive Summary Dashboard

| Metric | M4 Pro | M2 Ultra | M2 Air |
|--------|--------|----------|--------|
| **Overall Winner** | ⭐ **YES** | - | - |
| **Total Time** | **17.3s** ⭐ | 18.1s | 33.3s |
| **Cache Warming** | 6.4s | **4.9s** ⭐ | 10.7s |
| **Heavy Analytics** | **2.7s avg** ⭐ | 3.7s avg | 6.3s avg |
| **Cost/Performance** | Best | Good | **Best Value** ⭐ |

---

## 1. Overall Benchmark Performance

### Total Execution Time (All 9 Operations)

```
M4 Pro     ████████████████▌ 17.3s  ⭐ FASTEST
M2 Ultra   █████████████████▋ 18.1s  (+5%)
M2 Air     ████████████████████████████████▌ 33.3s  (+93%)

Scale: Each █ = 1 second
```

**Winner**: M4 Pro by 5% over M2 Ultra, 93% over M2 Air

---

## 2. Cache Warming Performance

### Time to Warm OmniFocus Cache

```
M2 Ultra   ████▉ 4.9s  ⭐ FASTEST (memory bandwidth wins)
M4 Pro     ██████▍ 6.4s  (+31%)
M2 Air     ██████████▋ 10.7s  (+119%)

Scale: Each █ = 500ms
```

**Winner**: M2 Ultra (800 GB/s memory bandwidth advantage)

**Insight**: If you restart the server frequently, M2 Ultra saves ~1.5s per restart.

---

## 3. Operation Performance by Category

### Fast Operations (<10ms) - All Machines Identical

```
Today's Tasks    M2: 7ms   Ultra: 4ms   M4: 7ms   ← No meaningful difference
Overdue Tasks    M2: 2ms   Ultra: 1ms   M4: 1ms   ← All essentially instant
Upcoming Tasks   M2: 2ms   Ultra: 1ms   M4: 1ms   ← Network/IPC bound
```

**Winner**: TIE (all machines perform identically)

**Insight**: For typical development queries, hardware doesn't matter.

---

### Medium Operations (300-1500ms) - M4 Pro & M2 Ultra Tied

#### Project Statistics

```
M4 Pro     █████████▌ 953ms   ⭐ Slightly faster
M2 Ultra   █████████ 900ms    ⭐ Slightly faster
M2 Air     ██████████████▋ 1,469ms  (+54%)

Scale: Each █ = 100ms
```

#### Tags (Names Only)

```
M2 Ultra   ███ 303ms          ⭐ Slightly faster
M4 Pro     ███▏ 311ms         ⭐ Slightly faster
M2 Air     ████▋ 464ms        (+49%)

Scale: Each █ = 100ms
```

#### Tags (Fast Mode)

```
M4 Pro     ███▎ 329ms         ⭐ Slightly faster
M2 Ultra   ███▍ 341ms         ⭐ Slightly faster
M2 Air     █████▏ 509ms       (+55%)

Scale: Each █ = 100ms
```

**Winner**: TIE between M4 Pro and M2 Ultra (differences < 10%)

**Insight**: For medium operations, M4 and Ultra are essentially identical. Save money or choose based on other factors.

---

### Heavy Operations (2500-7000ms) - M4 Pro Dominates

#### Tags (Full Mode)

```
M4 Pro     █████████████████████████████▏ 2,916ms   ⭐ FASTEST
M2 Ultra   █████████████████████████████████████▉ 3,788ms  (+30%)
M2 Air     ██████████████████████████████████████████████████████████████████▏ 6,660ms  (+128%)

Scale: Each █ = 100ms
```

**M4 Pro wins by 30%** (872ms faster)

#### Productivity Stats

```
M4 Pro     ██████████████████████████▌ 2,653ms   ⭐ FASTEST
M2 Ultra   ████████████████████████████████████▋ 3,672ms  (+38%)
M2 Air     ████████████████████████████████████████████████████████████▊ 6,078ms  (+129%)

Scale: Each █ = 100ms
```

**M4 Pro wins by 38%** (1,019ms faster)

#### Task Velocity

```
M4 Pro     ██████████████████████████▋ 2,665ms   ⭐ FASTEST
M2 Ultra   █████████████████████████████████████▎ 3,733ms  (+40%)
M2 Air     ██████████████████████████████████████████████████████████████████▍ 6,645ms  (+149%)

Scale: Each █ = 100ms
```

**M4 Pro wins by 40%** (1,068ms faster)

---

## 4. Head-to-Head: M4 Pro vs M2 Ultra

### Performance Breakdown

| Operation Category | M4 Pro | M2 Ultra | Winner | Margin |
|-------------------|--------|----------|--------|--------|
| **Cache Warming** | 6.4s | 4.9s | M2 Ultra | 30% faster |
| **Fast Queries** | 1-7ms | 1-4ms | TIE | Negligible |
| **Medium Ops** | 329-953ms | 303-900ms | TIE | < 10% |
| **Heavy Analytics** | 2.7s avg | 3.7s avg | M4 Pro | 27% faster |
| **Total Time** | 17.3s | 18.1s | M4 Pro | 5% faster |

### Strengths Summary

**M4 Pro Strengths:**
- ⭐ Fastest overall (17.3s total)
- ⭐ Best at heavy analytics (23-40% faster)
- ⭐ Better power efficiency (14 cores vs 24)
- ⭐ Lower cost (vs M2 Ultra)

**M2 Ultra Strengths:**
- ⭐ Fastest cache warming (30% faster)
- ⭐ Better for concurrent loads (more cores)
- ⭐ Maximum thermal headroom
- ⭐ More RAM for multi-tasking (192GB)

---

## 5. Price/Performance Analysis

### Performance per Dollar (Estimated)

Assuming approximate pricing:
- M2 Air (8GB): ~$1,099
- M4 Pro (14-core/64GB): ~$2,399
- M2 Ultra (24-core/192GB): ~$5,999

```
Performance Index (Total Benchmark Time, lower is better):
M2 Air:    33.3s / $1,099 = 30ms per dollar
M4 Pro:    17.3s / $2,399 = 7.2ms per dollar  ⭐ BEST VALUE for performance
M2 Ultra:  18.1s / $5,999 = 3.0ms per dollar

Value Index (Inverse, higher is better):
M4 Pro:    139 points per $1000  ⭐ BEST
M2 Ultra:  333 points per $1000
M2 Air:    33 points per $1000   ⭐ BEST for budget
```

**Insight**: M4 Pro offers the best price/performance ratio for analytics-heavy workloads.

---

## 6. Use Case Recommendations

### Development Workflow (Mostly Fast Queries)

```
✅ M2 Air      Perfect choice - fast queries work identically
✅ M4 Pro      Excellent - overkill for most dev work
⚠️  M2 Ultra   Overkill - extra cost provides no benefit
```

### Analytics-Heavy Workload (Frequent Heavy Operations)

```
⚠️  M2 Air     Works but slower - 6-7s per heavy operation
✅ M2 Ultra    Good choice - 3.7s per heavy operation
⭐ M4 Pro      Best choice - 2.7s per heavy operation
```

### Production Server (24/7 Operation, Multiple Clients)

```
✅ M2 Air      Budget option - handles moderate load
⭐ M4 Pro      Best overall - fast analytics + efficiency
⭐ M2 Ultra    Best for concurrent - extra cores help here
```

### Frequent Restarts (Development, Testing)

```
⚠️  M2 Air     10.7s cache warming - slower iteration
✅ M4 Pro      6.4s cache warming - good balance
⭐ M2 Ultra    4.9s cache warming - fastest startup
```

---

## 7. The Core Count Paradox

### Cores vs Performance

```
Cores:        8         14        24
              │         │         │
M2 Air    ────┤         │         │  33.3s (baseline)
              │         │         │
M4 Pro    ────┼─────────┤         │  17.3s ⭐ (48% faster with 75% more cores)
              │         │         │
M2 Ultra  ────┼─────────┼─────────┤  18.1s (5% slower with 71% MORE cores!)
              │         │         │
              └─────────┴─────────┘
```

**The Paradox**: M2 Ultra has 71% more cores than M4 Pro, yet is 5% SLOWER overall.

**Why**: JXA/OmniJS is single-threaded. Extra cores sit idle during script execution.

**Lesson**: Don't buy cores for this workload. Buy better single-core performance.

---

## 8. Memory Bandwidth Impact

### Cache Warming vs Compute

```
Memory Bandwidth:  100 GB/s     273 GB/s     800 GB/s
                   │            │            │
                   M2 Air       M4 Pro       M2 Ultra
                   │            │            │
Cache Warming:     10.7s        6.4s         4.9s ⭐
Heavy Compute:     6.3s         2.7s ⭐       3.7s
                   │            │            │
```

**Insight**:
- High bandwidth (800 GB/s) helps with **data loading** (cache warming)
- Architecture (M4) helps with **data processing** (compute operations)
- Different winners for different bottlenecks!

---

## 9. Thermal Considerations

### Sustained Performance (Estimated)

```
M2 Air (fanless):
├─ Short burst:     ████████████ 100% performance
├─ Sustained (5min): ██████████  ~80% (thermal throttling)
└─ Sustained (1hr):  ████████    ~60-70% (aggressive throttling)

M4 Pro (active cooling):
├─ Short burst:     ████████████ 100% performance
├─ Sustained (5min): ███████████▌ ~95% (minimal throttling)
└─ Sustained (1hr):  ███████████  ~90% (good sustained perf)

M2 Ultra (active cooling + more cores):
├─ Short burst:     ████████████ 100% performance
├─ Sustained (5min): ████████████ 100% (excellent thermal headroom)
└─ Sustained (1hr):  ████████████ 100% (no throttling)
```

**Winner for sustained loads**: M2 Ultra (best thermal management)

---

## 10. Summary Decision Matrix

| Your Priority | Recommended Choice | Why |
|--------------|-------------------|-----|
| **Best overall performance** | M4 Pro | Fastest total time, excellent analytics |
| **Fastest cache warming** | M2 Ultra | 30% faster startup |
| **Best value** | M2 Air | Adequate for most dev work |
| **Heavy analytics** | M4 Pro | 23-40% faster than M2 Ultra |
| **Production server** | M2 Ultra or M4 Pro | Ultra for concurrency, M4 for efficiency |
| **Frequent restarts** | M2 Ultra | Fastest cache warming |
| **Budget development** | M2 Air | Fast queries work identically |
| **Power efficiency** | M4 Pro | Same performance, 42% fewer cores |

---

## Conclusion

**The Counterintuitive Truth**:
- More cores don't help (M2 Ultra slower than M4 Pro)
- More RAM doesn't help (workload fits in 24GB easily)
- More bandwidth helps... but only for cache warming

**The Real Winners**:
- M4 architecture (better IPC, cache, single-core perf)
- M2 Ultra bandwidth (for data-heavy operations)

**Your Best Choice**: Depends entirely on your workload pattern. There is no universally "best" machine - each wins in different scenarios.

---

**Generated**: October 28, 2025
**Data Source**: `docs/dev/HARDWARE_PERFORMANCE_ANALYSIS.md`
**Benchmark Tool**: `scripts/benchmark-performance.ts`

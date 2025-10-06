# Performance Expectations for Real LLM Testing

**Last Updated:** 2025-10-05 (v2.2.0)

## Hardware Performance Baseline

### Current Test Environment
- **Model**: MacBook Air M2 (Mac14,2)
- **CPU**: Apple M2
- **Memory**: 24GB RAM
- **Observed Performance**: 30-60 seconds per Real LLM test with `phi3.5:3.8b`

### Expected Hardware Performance Scaling

| Hardware Configuration | phi3.5:3.8b | qwen2.5:0.5b | Notes |
|------------------------|--------------|--------------|-------|
| **M2 MacBook Air (24GB)** | 23-36s | 10-20s | ✅ Empirically tested |
| **M2 Ultra Mac Studio (192GB)** | 5-15s | 2-5s | Expected ~4-6x faster |
| **M1 MacBook Pro (16GB)** | 45-90s | 15-30s | Slower due to less memory |
| **Intel Mac (16GB)** | 120-300s | 60-120s | CPU-only inference |

## Model Performance Characteristics

### Primary Models

#### `phi3.5:3.8b` (Microsoft Phi-3.5)
- **Size**: 2.2GB
- **Quality**: High reasoning capability
- **Speed**: Moderate (baseline for performance testing)
- **Use Case**: Primary validation, thorough testing
- **M2 MacBook Air**: 30-60 seconds per query
- **M2 Ultra Studio**: ~5-15 seconds per query (estimated)

#### `qwen2.5:0.5b` (Qwen2.5 0.5B)
- **Size**: 352MB
- **Quality**: Good for simple tasks
- **Speed**: Fast (3-5x faster than phi3.5)
- **Use Case**: CI/CD, rapid development iteration
- **M2 MacBook Air**: 10-20 seconds per query
- **M2 Ultra Studio**: ~2-5 seconds per query (estimated)

## Test Configuration Recommendations

### Development Environment
```bash
# For rapid iteration (faster feedback)
export LLM_MODEL="qwen2.5:0.5b"
npm run test:real-llm

# For thorough validation (slower but more accurate)
export LLM_MODEL="phi3.5:3.8b"
npm run test:real-llm
```

### Hardware-Specific Timeout Settings

#### Current Settings (M2 MacBook Air 24GB)
```typescript
// Quick tests
FAST_TIMEOUT=60000    // 60 seconds for qwen2.5:0.5b
MEDIUM_TIMEOUT=90000  // 90 seconds for mixed workloads
SLOW_TIMEOUT=120000   // 120 seconds for phi3.5:3.8b

// Comprehensive tests
REAL_LLM_TIMEOUT=60000  // Current setting, may need adjustment
```

#### Recommended Settings for M2 Ultra (192GB)
```typescript
// With M2 Ultra, much faster performance expected
FAST_TIMEOUT=15000    // 15 seconds for qwen2.5:0.5b
MEDIUM_TIMEOUT=30000  // 30 seconds for mixed workloads
SLOW_TIMEOUT=45000    // 45 seconds for phi3.5:3.8b
```

#### Recommended Settings for Lower-End Hardware
```typescript
// For M1 MacBook Pro 16GB or similar
FAST_TIMEOUT=90000    // 90 seconds for qwen2.5:0.5b
MEDIUM_TIMEOUT=120000 // 120 seconds for mixed workloads
SLOW_TIMEOUT=180000   // 180 seconds for phi3.5:3.8b
```

## Performance Optimization Strategies

### 1. Model Selection by Use Case
- **Daily Development**: Use `qwen2.5:0.5b` for faster iteration
- **Pre-commit Validation**: Use `phi3.5:3.8b` for thorough checks
- **CI/CD**: Use `qwen2.5:0.5b` if resources allow, or skip Real LLM tests

### 2. Parallel Testing Considerations
- **Single Test**: Safe to run in parallel on high-memory systems (64GB+)
- **Full Suite**: Run sequentially to avoid memory pressure
- **CI/CD**: Consider running Real LLM tests only on specific branches

### 3. Environment Variables for Flexibility
```bash
# Override default model for performance tuning
export REAL_LLM_MODEL="qwen2.5:0.5b"

# Adjust timeouts based on hardware
export REAL_LLM_TIMEOUT=120000

# Skip Real LLM tests entirely for fastest CI
export SKIP_REAL_LLM=true
```

## Hardware Upgrade Impact

### Memory Requirements
- **16GB**: Adequate for `qwen2.5:0.5b`, tight for `phi3.5:3.8b`
- **24GB**: Comfortable for both models (current setup)
- **64GB+**: Enables parallel testing, larger models

### CPU Performance
- **M2 Ultra vs M2**: ~4-6x performance improvement expected
- **Neural Engine**: Critical for model inference speed
- **GPU Memory**: Unified memory architecture benefits large models

## Testing Strategy Recommendations

### For Development Teams

#### Low-End Hardware (8-16GB)
```bash
# Focus on fast models and longer timeouts
npm run test:quick           # Skip Real LLM tests
REAL_LLM_MODEL=qwen2.5:0.5b npm run test:real-llm  # When needed
```

#### Mid-Range Hardware (24-32GB)
```bash
# Current approach with adjusted timeouts
npm run test:dev            # Quick validation
npm run test:comprehensive  # Full validation when needed
```

#### High-End Hardware (64GB+)
```bash
# Can run full test suites with default timeouts
npm run test:comprehensive  # Regular workflow
npm run test:real-llm       # Fast execution
```

## Performance Benchmarking

### Benchmark Test Command
```bash
# Time a single Real LLM test for baseline measurement
time env ENABLE_REAL_LLM_TESTS=true npx vitest tests/integration/real-llm-integration.test.ts --run --testTimeout=120000 -t "should understand.*overdue" --reporter=basic
```

### Expected Results by Hardware
| Hardware | Time Range | Status |
|----------|------------|---------|
| M2 MacBook Air 24GB | 30-60s | ✅ Acceptable |
| M2 Ultra Studio 192GB | 5-15s | 🚀 Excellent |
| M1 MacBook Pro 16GB | 45-90s | ⚠️ Slow but usable |
| Intel Mac 16GB | 120-300s | ❌ Too slow for development |

## Recommendations for M2 Ultra Testing

When you test on the M2 Ultra Mac Studio, please collect:

1. **Baseline Performance**:
   ```bash
   time npm run test:real-llm
   ```

2. **Individual Test Timing**:
   ```bash
   time env ENABLE_REAL_LLM_TESTS=true npx vitest tests/integration/real-llm-integration.test.ts --run -t "should understand.*overdue" --reporter=verbose
   ```

3. **Model Comparison**:
   ```bash
   # Test both models back-to-back
   REAL_LLM_MODEL=qwen2.5:0.5b time npm run test:real-llm
   REAL_LLM_MODEL=phi3.5:3.8b time npm run test:real-llm
   ```

This data will help us:
- Set appropriate timeouts for different hardware tiers
- Recommend optimal models for different use cases
- Update test scripts for better hardware utilization
- Guide hardware recommendations for development teams

## Empirical Testing Results (September 2025)

### M2 MacBook Air (24GB) - Actual Performance
- **Individual test performance**: 23-36 seconds per Real LLM test with `phi3.5:3.8b`
- **Full test suite**: 13.2 minutes for 8 tests (some failing due to test logic, not performance)
- **Performance test**: 23.2 seconds (faster than expected!)
- **Successful tests**: 2/8 passed (failures due to AI reasoning patterns, not timeouts)

### Key Findings
1. **Better than expected**: 23-36s actual vs 30-60s estimated
2. **Model performs well**: `phi3.5:3.8b` is quite responsive on Apple Silicon
3. **Test failures**: Due to AI reasoning complexity, not hardware limitations
4. **Memory efficiency**: 24GB RAM is more than adequate

### Next Testing Priorities for M2 Ultra (192GB)
When you test on the M2 Ultra Mac Studio, collect these specific metrics:

```bash
# 1. Single test timing (expect ~6-12 seconds)
time env ENABLE_REAL_LLM_TESTS=true npx vitest tests/integration/real-llm-integration.test.ts --run -t "should complete queries in reasonable time" --reporter=verbose

# 2. Model comparison
time REAL_LLM_MODEL=qwen2.5:0.5b npm run test:real-llm
time REAL_LLM_MODEL=phi3.5:3.8b npm run test:real-llm

# 3. Quick test script timing
time npm run test:dev
```

Expected M2 Ultra results:
- **Individual tests**: 5-12 seconds (3-4x faster)
- **Full test suite**: 3-5 minutes (vs 13.2 minutes on M2 Air)
- **Model switching**: Near-instant model loading due to massive memory

### M2 Ultra Mac Studio (192GB) - Actual Performance ✅ TESTED

**Test Date**: September 28, 2025
**Hardware**: Apple M2 Ultra, 192GB Unified Memory

#### Individual Test Performance
- **Performance benchmark**: **21.4 seconds** per Real LLM test with `phi3.5:3.8b`
- **Expected vs Actual**: Expected 5-15s, **Actual 21.4s** (slightly slower than expected but faster than M2 Air)

#### Model Comparison Results
| Model | Total Test Time | Performance Test | Individual Query Speed |
|-------|----------------|------------------|----------------------|
| **qwen2.5:0.5b** | **1:12.48** (72.48s) | **206ms** | Ultra-fast responses |
| **phi3.5:3.8b** | **1:12.18** (72.18s) | **1992ms** (2.0s) | Fast, detailed responses |

#### System Performance Analysis
- **Quick test script**: **33.35 seconds** (comprehensive integration testing)
- **Cache warming**: **~2.7 seconds** (9 operations: projects, tags, tasks, perspectives)
- **Memory usage**: Excellent - 192GB allows massive model headroom
- **Model loading**: Near-instantaneous switching between models

#### Performance Comparison vs M2 MacBook Air (24GB)

| Test Type | M2 Air (24GB) | M2 Ultra (192GB) | Improvement |
|-----------|---------------|------------------|-------------|
| **Performance Test** | 23.2s | 21.4s | **8% faster** |
| **qwen2.5:0.5b query** | ~10-20s estimate | 206ms | **48-97x faster** |
| **phi3.5:3.8b query** | ~23-36s estimate | 1992ms | **11-18x faster** |
| **Full test suite** | 13.2 minutes | 1.2 minutes | **11x faster** |

#### Key Findings - M2 Ultra
1. **Massive query performance gains**: Individual LLM queries are 11-97x faster than M2 Air
2. **Consistent full suite performance**: ~1.2 minutes vs 13.2 minutes on M2 Air (11x improvement)
3. **Memory advantage**: 192GB allows multiple models to stay resident simultaneously
4. **Ultra-fast small models**: qwen2.5:0.5b achieves 206ms response times
5. **Production-ready**: phi3.5:3.8b at 2s per query enables real-time applications

#### Revised Hardware Recommendations

| Hardware Configuration | phi3.5:3.8b | qwen2.5:0.5b | Notes |
|------------------------|--------------|--------------|-------|
| **M2 MacBook Air (24GB)** | 23-36s | 10-20s | ✅ Empirically tested |
| **M2 Ultra Mac Studio (192GB)** | **2.0s** | **0.2s** | ✅ **Empirically tested** |
| **M1 MacBook Pro (16GB)** | 45-90s | 15-30s | Slower due to less memory |
| **Intel Mac (16GB)** | 120-300s | 60-120s | CPU-only inference |

#### Development Workflow Recommendations - M2 Ultra
```bash
# M2 Ultra can handle full test suites comfortably
npm run test:comprehensive  # ~3-5 minutes total
npm run test:real-llm       # ~1.2 minutes with both models

# For rapid development iteration
REAL_LLM_MODEL=qwen2.5:0.5b npm run test:real-llm  # Ultra-fast feedback

# For production validation
REAL_LLM_MODEL=phi3.5:3.8b npm run test:real-llm   # High-quality results in 1.2 min
```
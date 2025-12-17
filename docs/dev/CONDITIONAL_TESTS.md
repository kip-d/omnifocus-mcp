# Conditional Integration Tests

This document describes the 30 optional integration tests that are skipped by default and require specific conditions or
environment variables to run.

## Overview

The test suite includes three categories of conditional tests:

| Test Suite       | Tests  | Environment Variable               | Additional Requirements |
| ---------------- | ------ | ---------------------------------- | ----------------------- |
| LLM Simulation   | 14     | `ENABLE_LLM_SIMULATION_TESTS=true` | None                    |
| Real LLM         | 8      | `ENABLE_REAL_LLM_TESTS=true`       | Ollama + AI models      |
| Batch Operations | 8      | `VITEST_ALLOW_JXA=1`               | None                    |
| **Total**        | **30** |                                    |                         |

## 1. LLM Assistant Simulation Tests (14 tests)

**File:** `tests/integration/llm-assistant-simulation.test.ts`

### Purpose

Tests realistic multi-step workflows as if an LLM assistant (like Claude) is orchestrating the tools.

### What These Test

- Simulated LLM conversation flows
- Multi-tool workflows (task management, project planning)
- GTD (Getting Things Done) processes
- Complex multi-step operations

### How to Enable

```bash
export ENABLE_LLM_SIMULATION_TESTS=true
npm run test:integration -- tests/integration/llm-assistant-simulation.test.ts
```

### Use Case

Validates that the tool APIs are designed in a way that LLMs can naturally orchestrate them to accomplish complex user
requests.

---

## 2. Real LLM Integration Tests (8 tests)

**File:** `tests/integration/real-llm-integration.test.ts`

### Purpose

Validates that actual AI models (via Ollama) can understand and use the MCP tools correctly through natural language
reasoning.

### What These Test

- Actual AI model interaction with tool descriptions
- Natural language understanding of tool schemas
- Intelligent tool selection and sequencing
- Complex workflow execution with real LLM reasoning
- Emergent behavior discovery

### Requirements

1. **Ollama installed and running**
2. **Small AI models downloaded** (phi3.5:3.8b, qwen2.5:0.5b, or similar)

### How to Enable

#### Step 1: Install Ollama

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh
```

#### Step 2: Start Ollama Server

```bash
# Start in background
ollama serve

# Or run in separate terminal
```

#### Step 3: Pull Required Models

```bash
# Download small models for testing
ollama pull phi3.5:3.8b
ollama pull qwen2.5:0.5b

# Or use other small models (< 4B parameters recommended)
```

#### Step 4: Run Tests

```bash
export ENABLE_REAL_LLM_TESTS=true
npm run test:integration -- tests/integration/real-llm-integration.test.ts
```

### Use Case

Proves that real LLMs can understand the tool descriptions and successfully complete tasks without scripted
instructions. This is the ultimate validation that the MCP API is LLM-friendly.

---

## 3. Batch Operations Tests (8 tests)

**File:** `tests/integration/batch-operations.test.ts`

### Purpose

Tests bulk creation operations for tasks and projects using the unified API.

### What These Test

- Batch task creation
- Batch project creation
- Hierarchical project structures
- Bulk operations with real OmniFocus

### How to Enable

```bash
export VITEST_ALLOW_JXA=1
npm run test:integration -- tests/integration/batch-operations.test.ts
```

### Status

✅ **Updated to use unified API** - These tests now use `omnifocus_write` with batch operations instead of the legacy
`BatchCreateTool`.

### Use Case

Validates that the unified write API can handle bulk operations efficiently, crucial for scenarios like importing
projects or creating multiple related tasks at once.

---

## Running All Conditional Tests

To run all optional tests in a single session:

```bash
# Terminal 1: Start Ollama (if running real LLM tests)
ollama serve

# Terminal 2: Enable all conditional tests and run
export ENABLE_LLM_SIMULATION_TESTS=true
export ENABLE_REAL_LLM_TESTS=true
export VITEST_ALLOW_JXA=1

npm run test:integration
```

### Expected Results

When all conditions are met:

- **Total tests:** 79 (49 standard + 30 conditional)
- **All passing:** 79/79

---

## When to Run These Tests

### During Development

- **LLM Simulation:** Run when changing tool schemas or descriptions
- **Real LLM:** Run before releases to validate LLM compatibility
- **Batch Operations:** Run when modifying write operations

### CI/CD Considerations

- **LLM Simulation:** Can run in CI (no external dependencies)
- **Real LLM:** Requires Ollama setup in CI environment
- **Batch Operations:** Can run in CI on macOS runners with OmniFocus

### Manual Testing

Run these tests manually before:

- Major version releases
- API redesigns
- Tool consolidation efforts
- Documentation updates

---

## Troubleshooting

### LLM Simulation Tests Fail

- Check that the server starts correctly
- Verify tool definitions are valid
- Check for network/timing issues

### Real LLM Tests Fail

```bash
# Verify Ollama is running
curl http://localhost:11434/api/tags

# Check if models are available
ollama list

# Test model directly
ollama run phi3.5:3.8b "Hello"
```

### Batch Operations Tests Fail

- Ensure OmniFocus is running
- Check that OmniFocus is not showing dialogs
- Verify JXA permissions are granted
- Check `VITEST_ALLOW_JXA=1` is set

---

## Notes

1. **Isolation:** Conditional tests create and clean up their own test data
2. **Performance:** Real LLM tests can be slow (AI inference time)
3. **Platform:** All tests require macOS with OmniFocus installed
4. **Cleanup:** Tests automatically clean up created items in `afterAll` hooks

# Test Directory Structure

This directory contains all tests for the OmniFocus MCP server.

## Directory Organization

### `/unit`
Unit tests for individual functions and modules. These tests run quickly and don't require OmniFocus to be running.
- Run with: `npm test`

### `/integration`
Integration tests that verify MCP protocol communication and tool functionality.
- `test-as-claude-desktop.js` - Main integration test simulating Claude Desktop
- Tool-specific integration tests
- Run with: `npm run test:integration`

### `/manual`
Manual test scripts for debugging and development. These are not part of the automated test suite.
- Direct JXA script tests
- Debug utilities
- Performance testing scripts
- `/perspectives` - Perspective-specific manual tests

### `/features`
Gherkin/Cucumber feature tests for behavior-driven development.
- Run with: `npm run test:features`

### `/scenarios`
Complex scenario tests that combine multiple operations.

### `/support`
Test utilities, helpers, and shared fixtures.

## Running Tests

```bash
# Run all automated tests
npm run test:all

# Run unit tests only
npm test

# Run integration tests
npm run test:integration

# Run specific manual test
node tests/manual/test-perspectives.js
```

## Test File Naming Convention

- Unit tests: `*.test.ts` or `*.spec.ts`
- Integration tests: `test-*.js` or `*.integration.ts`
- Manual tests: `test-*.js` or `debug-*.js`
- Support files: No specific prefix

## Adding New Tests

1. Unit tests go in `/unit` with `.test.ts` extension
2. Integration tests go in `/integration`
3. Manual debugging scripts go in `/manual`
4. Shared test utilities go in `/support`
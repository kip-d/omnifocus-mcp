# Scripts Directory

This directory contains utility and testing scripts for the OmniFocus MCP server.

## Utility Scripts

### `emergency-diagnostic.js`

Quick diagnostic script to test all MCP tools rapidly. Useful for debugging server issues.

```bash
node scripts/emergency-diagnostic.js
```

### `test-single-tool-proper.js`

Test individual MCP tools with proper initialization sequence (matches Claude Desktop behavior).

```bash
node scripts/test-single-tool-proper.js <tool_name> [params]
```

### Script Size Analysis

#### `check-script-sizes.js`

Check generated script sizes against empirical limits.

#### `measure-actual-script-sizes.js`

Measure actual script sizes during execution.

#### `measure-script-sizes.js`

General script size measurement utility.

## Development Utilities

### `minimal-test-server.js`

Minimal MCP server for testing basic functionality.

```bash
node scripts/minimal-test-server.js
```

## Usage Notes

- All scripts assume you're running from the project root directory
- Scripts require the project to be built (`npm run build`) before use
- For OmniFocus-related scripts, ensure OmniFocus is running and permissions are granted

## See Also

- `/tests/` - Unit and integration tests
- `/docs/TESTING_TOOLS.md` - Comprehensive testing documentation
- `/.archive/investigation-scripts/` - Historical debugging and investigation scripts

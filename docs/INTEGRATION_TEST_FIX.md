# Integration Test Graceful Exit Fix

**Date:** October 2, 2025
**Issue:** Integration tests were killing the server immediately instead of allowing graceful shutdown
**Status:** ✅ Fixed

---

## The Problem

The integration tests were:
1. Closing stdin (correct per MCP spec) ✅
2. **Immediately killing the server with SIGTERM** ❌
3. Waiting only 750ms before SIGKILL ❌

This prevented the server from:
- Waiting for pending OmniFocus operations to complete
- Exiting gracefully per MCP specification
- Demonstrating proper MCP lifecycle compliance

---

## The Fix

### Before (Incorrect)
```javascript
const cleanup = (code = 0) => {
  if (cleanupDone) return;
  cleanupDone = true;

  try {
    server.stdin.end();  // ✅ Close stdin
  } catch (e) {}

  server.kill('SIGTERM');  // ❌ Kill immediately!

  setTimeout(() => {
    if (!server.killed) {
      server.kill('SIGKILL');
    }
    process.exit(code);
  }, 750);
};
```

### After (Correct)
```javascript
const cleanup = (code = 0) => {
  if (cleanupDone) return;
  cleanupDone = true;

  // Remove the unexpected exit listener
  server.removeAllListeners('exit');

  // Close stdin to signal graceful shutdown per MCP spec
  try {
    server.stdin.end();  // ✅ Close stdin
  } catch (e) {}

  // Wait for server to exit gracefully (it will wait for pending operations)
  const gracefulExitTimeout = setTimeout(() => {
    console.log('⚠️  Server did not exit gracefully within 5s, sending SIGTERM...');
    server.kill('SIGTERM');

    // Last resort: force kill after another 2s
    setTimeout(() => {
      if (!server.killed) {
        console.log('⚠️  Server did not respond to SIGTERM, sending SIGKILL...');
        server.kill('SIGKILL');
      }
      process.exit(code);
    }, 2000);
  }, 5000);  // ✅ Give server 5 seconds to exit gracefully

  // If server exits naturally, clear the timeout and exit
  server.once('exit', (exitCode) => {
    clearTimeout(gracefulExitTimeout);
    if (exitCode === 0) {
      process.exit(code);
    } else {
      console.error(`⚠️  Server exited with code ${exitCode}`);
      process.exit(code || exitCode);
    }
  });
};
```

---

## The Flow Now

### Proper MCP Lifecycle Compliance

1. **Test completes successfully:**
   ```
   ✅ Integration validations completed successfully!
   ```

2. **Test closes stdin:**
   ```javascript
   server.stdin.end();
   ```

3. **Server detects stdin closure:**
   ```
   [INFO] [server] stdin closed, waiting for pending operations to complete...
   ```

4. **Server waits for pending operations:**
   - All OmniFocus osascript processes complete
   - Pending operations set drains to 0

5. **Server exits gracefully:**
   ```
   [INFO] [server] Exiting gracefully per MCP specification
   ```

6. **Test cleanup detects exit and terminates:**
   ```
   Exit code: 0
   ```

---

## Test Results

### Before Fix ❌
```
Integration test timed out
Exit code: 1
```

### After Fix ✅
```
✅ Integration validations completed successfully!
[INFO] [server] stdin closed, waiting for pending operations to complete...
[INFO] [server] Exiting gracefully per MCP specification
Exit code: 0
```

**Duration:** ~15-20 seconds (clean exit, no timeout)

---

## Why This Matters

1. **MCP Specification Compliance:** The server now properly implements MCP lifecycle per spec
2. **No Lost Operations:** All pending OmniFocus operations complete before exit
3. **Clean Testing:** Tests exit cleanly with proper exit codes
4. **Real-World Simulation:** Tests now behave like actual MCP clients (Claude Desktop)
5. **Demonstrates Quality:** Shows the graceful shutdown infrastructure actually works!

---

## Files Modified

- `tests/integration/test-as-claude-desktop.js` - Fixed cleanup() function

---

## Key Learnings

1. **MCP servers exit when stdin closes** - this is the proper shutdown mechanism
2. **Don't kill what you're testing** - let the server demonstrate its graceful exit
3. **Trust your infrastructure** - we built graceful shutdown, let it work!
4. **Give processes time** - 5 seconds is reasonable for cleanup, 750ms was not

---

## Related Infrastructure

This fix demonstrates that our graceful shutdown infrastructure (implemented months ago) works correctly:

- `src/index.ts`: stdin 'end' and 'close' handlers
- `src/omnifocus/OmniAutomation.ts`: pending operations tracking
- Async operation lifecycle management

All of this was already built - the tests just weren't using it properly!

# OmniFocus MCP Bridge Permission Check Guide

This guide will help you verify all permissions are correctly set for the OmniFocus MCP Bridge.

## Step 1: Check System Preferences Permissions

### 1.1 Automation Permissions
1. Open **System Settings** (macOS Ventura or later) or **System Preferences** (older macOS)
2. Go to **Privacy & Security** → **Automation**
3. Look for **Claude** or **Claude Desktop** in the list
4. Ensure the following are checked:
   - ✅ **OmniFocus** (or **OmniFocus 3**)
   - ✅ **System Events** (if present)

### 1.2 JavaScript/AppleScript Permissions
1. Still in **Privacy & Security**
2. Go to **Accessibility** 
3. Ensure **Claude Desktop** is in the list and checked ✅
4. If not present, click the lock 🔒 to make changes, then:
   - Click the **+** button
   - Navigate to `/Applications/Claude.app` and add it
   - Make sure it's checked ✅

### 1.3 Full Disk Access (if needed)
1. Go to **Privacy & Security** → **Full Disk Access**
2. Check if **Claude Desktop** needs to be added here
3. This is usually only needed if OmniFocus stores data in protected locations

## Step 2: Terminal Permission Test

Open Terminal and run these commands to verify basic AppleScript access:

```bash
# Test 1: Basic OmniFocus access
osascript -l JavaScript -e 'Application("OmniFocus").name()'
# Expected output: "OmniFocus"

# Test 2: Document access
osascript -l JavaScript -e 'const app = Application("OmniFocus"); const doc = app.defaultDocument(); doc ? "Document available" : "No document"'
# Expected output: "Document available"

# Test 3: Task count
osascript -l JavaScript -e 'const app = Application("OmniFocus"); const doc = app.defaultDocument(); doc.flattenedTasks().length'
# Expected output: A number (your task count)
```

If any of these fail with permission errors, you'll need to grant Terminal automation permissions as well.

## Step 3: Reset Permissions (if needed)

If permissions seem corrupted, you can reset them:

```bash
# Reset automation permissions for Claude Desktop
tccutil reset AppleEvents com.anthropic.claude-desktop

# You'll need to re-grant permissions after this
```

## Step 4: OmniFocus-Specific Checks

### 4.1 Check OmniFocus is Running
1. Ensure OmniFocus is fully launched (not just in the dock)
2. Make sure you have at least one document open
3. Try creating a test task manually to ensure OmniFocus is responsive

### 4.2 Check for Modal Dialogs
1. Switch to OmniFocus
2. Look for any modal dialogs that might be blocking automation:
   - License dialogs
   - Update notifications
   - Sync conflict dialogs
   - Any error messages

### 4.3 Check Sync Status
1. In OmniFocus, check if sync is stuck or showing errors
2. A stuck sync can sometimes block automation access

## Step 5: Run MCP Diagnostic Tool

After building with the diagnostic tool added, run this in Claude Desktop:

```
omnifocus:run_diagnostics
```

This will provide detailed information about:
- Connection status
- Document availability
- Collection access (tasks, projects, tags)
- Property access
- Exact error locations

## Step 6: Common Issues and Solutions

### Issue: "Cannot convert undefined or null to object"
**Possible Causes:**
1. **Permission not granted**: Claude Desktop doesn't have automation permission for OmniFocus
2. **OmniFocus not ready**: Document not loaded or modal dialog blocking
3. **Script execution timeout**: Large database causing scripts to timeout

**Solutions:**
1. Follow Steps 1-2 to verify permissions
2. Restart both OmniFocus and Claude Desktop
3. Try with a smaller OmniFocus database to test

### Issue: All functions fail except get_version_info
**Diagnosis**: This indicates the MCP server is running but cannot access OmniFocus
**Solution**: This is almost always a permission issue - carefully follow Step 1

### Issue: "Script execution failed with code null"
**Possible Causes:**
1. Script syntax error (unlikely if others work)
2. Script timeout
3. Memory issue with large datasets

**Solutions:**
1. Use the diagnostic tool to identify the exact failure point
2. Try operations with smaller datasets (use filters)

## Step 7: Provide Diagnostic Information

If issues persist, please provide:

1. **macOS version**: `sw_vers -productVersion`
2. **OmniFocus version**: In OmniFocus, go to **OmniFocus → About OmniFocus**
3. **Permission screenshots**: Screenshots of System Settings → Privacy & Security → Automation
4. **Terminal test results**: Output from Step 2
5. **Diagnostic tool output**: Full output from `omnifocus:run_diagnostics`

## Additional Notes

- Permissions sometimes need to be toggled off and on again to take effect
- A full restart of both applications often helps
- Some antivirus software can interfere with AppleScript execution
- Corporate MDM profiles might restrict automation permissions
# OmniFocus MCP Permissions Guide

## Overview

The OmniFocus MCP server requires permission to access OmniFocus via AppleScript/JavaScript for Automation (JXA). This document explains how the permission system works and how to grant the necessary permissions.

## How Permissions Work

### Automatic Permission Check

When the MCP server starts, it automatically performs a non-blocking permission check to verify access to OmniFocus. This check:

1. Attempts to connect to OmniFocus via AppleScript
2. Caches the result to avoid repeated permission prompts
3. Logs the permission status without blocking server startup

### Permission Enforcement

When you use any OmniFocus tool:

1. The server checks if permissions have been granted
2. If permissions are denied, it returns a helpful error message with instructions
3. If permissions are granted, the tool executes normally

### Permission Caching

To improve performance and user experience:

- Permission status is cached after the first check
- If permission is granted, the cache is used indefinitely
- If permission is denied, the cache expires after 60 seconds (allowing retry)
- The cache is automatically cleared if a permission error occurs during execution

## Granting Permissions

### First-Time Setup

When you first use an OmniFocus command, macOS may automatically prompt you:

1. A dialog will appear asking if you want to allow access to OmniFocus
2. Click "OK" or "Allow" to grant permission
3. The permission is saved permanently in System Settings

### Manual Permission Grant

If you need to manually grant or verify permissions:

1. Open **System Settings** (System Preferences on older macOS)
2. Go to **Privacy & Security** > **Automation**
3. Find your terminal application:
   - Terminal.app
   - iTerm2.app
   - Visual Studio Code (if using integrated terminal)
   - Or whatever app is running the MCP server
4. Enable the checkbox next to **OmniFocus**
5. Restart the MCP server if it was already running

### Troubleshooting Permissions

#### Permission Denied Errors

If you see a permission error, the server will provide detailed instructions:

```
MCP error -32603: Permission denied: User needs to grant access to OmniFocus

To grant OmniFocus permissions:

1. Open System Settings (System Preferences on older macOS)
2. Go to Privacy & Security > Automation
3. Find your terminal application (Terminal, iTerm, or the app running this server)
4. Enable access to OmniFocus
5. If you don't see OmniFocus listed, try running a command and macOS will prompt you

Alternative: When you first use an OmniFocus command, macOS may show a permission dialog. Click "OK" to grant access.

Note: You may need to restart the MCP server after granting permissions.
```

#### OmniFocus Not Found

If OmniFocus is not installed or cannot be found:

```
OmniFocus is not installed or cannot be found.

Please ensure:
1. OmniFocus is installed on your Mac
2. OmniFocus is located in /Applications/
3. You have OmniFocus 3 or later installed

If OmniFocus is installed in a different location, you may need to create an alias in /Applications/
```

#### Timeout Errors

If the permission check times out:

```
The permission check timed out.

This might happen if:
1. OmniFocus is starting up - please wait and try again
2. A dialog box is blocking OmniFocus
3. Your system is under heavy load

Please ensure OmniFocus is running normally and try again.
```

## Testing Permissions

To test if permissions are working correctly:

1. Build the project: `npm run build`
2. Run the permission test: `npx tsx tests/test-permissions.ts`

This will:
- Check current permission status
- Attempt to execute a simple OmniFocus script
- Display any error messages with instructions

## Technical Details

### Permission Check Implementation

The permission system is implemented in `src/utils/permissions.ts` and provides:

- **PermissionsChecker**: Singleton class that manages permission state
- **withPermissionCheck**: Middleware function that wraps OmniFocus operations
- **Automatic retry**: Clears cache on permission errors for retry

### Integration Points

1. **Server Startup** (`src/index.ts`): Non-blocking permission check on startup
2. **OmniAutomation** (`src/omnifocus/OmniAutomation.ts`): Permission check before script execution
3. **Error Handling**: Automatic cache invalidation on permission errors

### Security Considerations

- Permissions are managed by macOS at the system level
- Once granted, permissions persist until manually revoked
- No sensitive data is stored by the permission system
- Permission checks are lightweight and non-invasive

## Best Practices

1. **Initial Setup**: Grant permissions during initial setup to avoid interruptions
2. **Error Handling**: Always check error messages for permission-related issues
3. **Terminal Apps**: Use the same terminal app consistently to avoid re-granting permissions
4. **Updates**: After macOS updates, you may need to re-grant permissions

## FAQ

**Q: Why does the server need these permissions?**
A: OmniFocus doesn't provide a public API, so we use Apple's official automation framework (JXA) which requires user permission for security.

**Q: Are permissions safe to grant?**
A: Yes, these are standard macOS automation permissions. The server only accesses OmniFocus data as requested by your commands.

**Q: Can I revoke permissions later?**
A: Yes, you can revoke permissions anytime in System Settings > Privacy & Security > Automation.

**Q: Do I need to grant permissions for each terminal app?**
A: Yes, macOS tracks permissions per application. If you switch terminal apps, you'll need to grant permissions again.
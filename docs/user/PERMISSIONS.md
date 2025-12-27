# Permissions Guide

The MCP server requires macOS Automation permission to access OmniFocus via JXA.

## How It Works

On startup, the server checks permission status non-blocking and caches the result.

| Scenario | Behavior |
|----------|----------|
| Permission granted | Cached indefinitely |
| Permission denied | Cached 60 seconds, then retry |
| Error during execution | Cache cleared for immediate retry |

## Granting Permissions

### Automatic (First Use)

macOS prompts automatically on first OmniFocus command. Click "OK" to grant—permission saves permanently.

### Manual Grant

1. **System Settings** → **Privacy & Security** → **Automation**
2. Find your terminal app (Terminal, iTerm, VS Code, etc.)
3. Enable **OmniFocus** checkbox
4. Restart MCP server

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| Permission denied | macOS blocked automation | Grant permission via System Settings (see above) |
| OmniFocus not found | Not installed or wrong location | Install in `/Applications/` (v3+) |
| Timeout | Dialog blocking or system load | Close OmniFocus dialogs, retry |

## Testing

```bash
npm run build
npx tsx tests/test-permissions.ts  # Checks status and runs simple script
```

## Technical Details

| Component | Location | Purpose |
|-----------|----------|---------|
| PermissionsChecker | `src/utils/permissions.ts` | Singleton managing permission state |
| withPermissionCheck | `src/utils/permissions.ts` | Middleware wrapping OmniFocus operations |
| Startup check | `src/index.ts` | Non-blocking check on server start |
| Execution check | `src/omnifocus/OmniAutomation.ts` | Validates before script execution |

**Security:** macOS manages permissions at system level. Once granted, they persist until revoked. No sensitive data stored.

## Best Practices

- Grant permissions during initial setup
- Use the same terminal app consistently (avoids re-granting)
- Re-grant after macOS updates if prompted

## FAQ

| Question | Answer |
|----------|--------|
| Why needed? | OmniFocus lacks public API; JXA requires user permission |
| Safe to grant? | Yes—standard macOS automation; only accesses what you request |
| Can revoke? | System Settings → Privacy & Security → Automation |
| Per-app permissions? | Yes—switch terminal apps requires re-granting |

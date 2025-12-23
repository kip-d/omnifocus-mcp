# Remote Access via HTTP Transport

This guide explains how to access OmniFocus on your Mac from another device (like a Windows PC) using the HTTP transport
mode.

## Overview

By default, the OmniFocus MCP server uses stdio transport, which requires running on the same machine as OmniFocus. HTTP
transport mode lets you run the server on your Mac and connect to it remotely from any device on your network.

**Common Use Case:** Run Claude Desktop on a Windows PC and access OmniFocus running on your Mac.

## Important: Client Compatibility

Different Claude clients support different transports:

| Client | stdio | HTTP/SSE Remote |
|--------|-------|-----------------|
| Claude Desktop | ✅ | ❌ (requires bridge) |
| Claude Code | ✅ | ✅ |
| Claude.ai (web) | - | ✅ (Pro/Max/Team/Enterprise) |

**Claude Desktop only supports stdio transport.** To connect to a remote HTTP server, you need to use `mcp-remote` as a
bridge (see below).

## Prerequisites

- **Mac (server):** OmniFocus 4.6+, Node.js 18+, the omnifocus-mcp server installed
- **Remote device (client):** Claude Desktop (with Node.js for the bridge) or Claude Code
- **Network:** Both devices on same network, or connected via Tailscale/VPN

## Quick Start

### Step 1: Start the Server on Mac (HTTP Mode)

```bash
cd /path/to/omnifocus-mcp

# Start in HTTP mode on port 3000
node dist/index.js --http --port 3000
```

You should see:

```
[INFO] Starting server in HTTP mode
[INFO] HTTP server listening on 0.0.0.0:3000
[INFO] HTTP server ready and accepting connections
```

**Note:** Cache warming takes 8-22 seconds. Wait for "HTTP server ready" before connecting clients.

### Step 2: Configure the Client

#### Option A: Claude Code (Recommended - Native HTTP Support)

Claude Code supports remote HTTP servers directly:

```bash
claude mcp add omnifocus --transport http http://YOUR-MAC-IP:3000/mcp
```

Or add to your Claude Code settings.

#### Option B: Claude Desktop (Requires mcp-remote Bridge)

Claude Desktop only supports stdio, so you need `mcp-remote` to bridge to the HTTP server.

**Prerequisites on Windows:** Install Node.js 18+ from https://nodejs.org

Edit Claude Desktop's configuration file:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Mac (if testing locally):** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://YOUR-MAC-IP:3000/mcp"]
    }
  }
}
```

Replace `YOUR-MAC-IP` with your Mac's IP address (e.g., `192.168.1.100`) or Tailscale hostname (e.g.,
`macbook.tailnet-name.ts.net`).

### Step 3: Restart Your Client

Fully quit and restart Claude Desktop or Claude Code. You should now be able to ask about your OmniFocus tasks!

## Secure Setup with Tailscale (Recommended)

For secure remote access outside your local network, use [Tailscale](https://tailscale.com/):

### On Your Mac:

1. Install Tailscale and log in
2. Note your Mac's Tailscale hostname (e.g., `macbook.tailnet-name.ts.net`)
3. Generate an authentication token:

```bash
export MCP_AUTH_TOKEN=$(openssl rand -hex 32)
echo "Your auth token: $MCP_AUTH_TOKEN"
# Save this token - you'll need it for Claude Desktop config
```

4. Start the server with authentication:

```bash
# Token from environment variable
node dist/index.js --http --port 3000
```

### On Your Windows PC:

1. Install Tailscale and log in with the same account
2. Install Node.js 18+ from https://nodejs.org
3. Configure Claude Desktop with mcp-remote bridge:

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://macbook.tailnet-name.ts.net:3000/mcp",
        "--header",
        "Authorization:${AUTH_TOKEN}"
      ],
      "env": {
        "AUTH_TOKEN": "Bearer YOUR-SECRET-TOKEN"
      }
    }
  }
}
```

Replace `YOUR-SECRET-TOKEN` with the token you generated on your Mac.

**Note:** The `env` workaround is required because Claude Desktop on Windows has a bug with spaces in args.

### With Claude Code (Simpler):

```bash
claude mcp add omnifocus --transport http \
  --header "Authorization: Bearer YOUR-SECRET-TOKEN" \
  http://macbook.tailnet-name.ts.net:3000/mcp
```

## CLI Options

| Flag            | Default   | Description                                        |
| --------------- | --------- | -------------------------------------------------- |
| `--http`        | off       | Enable HTTP transport (required for remote access) |
| `--port <n>`    | `3000`    | HTTP server port                                   |
| `--host <addr>` | `0.0.0.0` | Bind address (`127.0.0.1` for local-only)          |
| `-h, --help`    | -         | Show help message                                  |

## Environment Variables

| Variable         | Purpose                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| `MCP_AUTH_TOKEN` | Bearer token for authentication (highly recommended for remote access) |
| `MCP_PORT`       | Alternative to `--port` flag                                           |
| `MCP_HOST`       | Alternative to `--host` flag                                           |

## Running as a Background Service (macOS)

For always-on access, create a launchd service:

### 1. Create the plist file

```bash
cat > ~/Library/LaunchAgents/com.omnifocus.mcp.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.omnifocus.mcp</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/omnifocus-mcp/dist/index.js</string>
        <string>--http</string>
        <string>--port</string>
        <string>3000</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>MCP_AUTH_TOKEN</key>
        <string>your-secret-token-here</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/omnifocus-mcp.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/omnifocus-mcp.err</string>
</dict>
</plist>
EOF
```

**Important:** Update the paths for your system:

- Replace `/usr/local/bin/node` with your Node.js path (find with `which node`)
- Replace `/path/to/omnifocus-mcp` with your actual installation path
- Replace `your-secret-token-here` with your generated token

### 2. Load the service

```bash
launchctl load ~/Library/LaunchAgents/com.omnifocus.mcp.plist
```

### 3. Manage the service

```bash
# Check status
launchctl list | grep omnifocus

# Stop the service
launchctl stop com.omnifocus.mcp

# Start the service
launchctl start com.omnifocus.mcp

# Unload (remove) the service
launchctl unload ~/Library/LaunchAgents/com.omnifocus.mcp.plist

# View logs
tail -f /tmp/omnifocus-mcp.log
```

## HTTP Endpoints

| Path        | Method | Purpose                                  |
| ----------- | ------ | ---------------------------------------- |
| `/mcp`      | POST   | MCP JSON-RPC requests                    |
| `/mcp`      | GET    | Server-Sent Events stream                |
| `/mcp`      | DELETE | Session termination                      |
| `/health`   | GET    | Health check (returns `{"status":"ok"}`) |
| `/sessions` | GET    | Active session information               |

## Testing the Connection

### From Mac (verify server is running):

```bash
# Check health endpoint
curl http://localhost:3000/health
# Should return: {"status":"ok","version":"3.0.0",...}
```

### From Windows (verify connectivity):

```powershell
# Replace with your Mac's IP or Tailscale hostname
curl http://YOUR-MAC-IP:3000/health
```

### Test with authentication:

```bash
curl -H "Authorization: Bearer YOUR-TOKEN" http://YOUR-MAC-IP:3000/health
```

## Troubleshooting

### "Connection refused" from Windows

1. **Check server is running:**

   ```bash
   # On Mac
   curl http://localhost:3000/health
   ```

2. **Check firewall:** macOS firewall may block incoming connections
   - System Settings > Network > Firewall > Options
   - Add Node.js or disable firewall for testing

3. **Check network connectivity:**

   ```powershell
   # From Windows - can you ping the Mac?
   ping YOUR-MAC-IP
   ```

4. **Verify port is open:**
   ```bash
   # On Mac - check what's listening
   lsof -i :3000
   ```

### "401 Unauthorized"

- Verify the `Authorization` header in your mcp-remote config
- Make sure the token matches `MCP_AUTH_TOKEN` on the server
- Use the `env` workaround for the "Bearer " prefix (see Tailscale section above)

### mcp-remote not found or fails to start

1. **Verify Node.js is installed:**
   ```powershell
   node --version   # Should show v18 or higher
   npx --version    # Should work
   ```

2. **Test mcp-remote manually:**
   ```powershell
   npx -y mcp-remote http://YOUR-MAC-IP:3000/mcp
   ```
   If this fails, the issue is with mcp-remote or network connectivity.

3. **Check npx cache issues:**
   ```powershell
   npx clear-npx-cache
   ```

### Claude Desktop doesn't see the server

1. **Check configuration file syntax:** JSON must be valid (no trailing commas)
2. **Restart Claude Desktop completely:** Quit and reopen, don't just refresh
3. **Verify mcp-remote is being used:** Check that `command` is `npx`, not a `url` field
4. **Check logs:**
   - Windows: `%APPDATA%\Claude\Logs\`
   - Mac: `~/Library/Logs/Claude/`

### Server shows "session created" but Claude times out

- OmniFocus may have a dialog blocking execution (sync conflict, etc.)
- Check if OmniFocus is in the foreground and responsive
- Try running a simple query: "What's in my inbox?"

### Sessions keep getting created

This is normal behavior. HTTP transport creates a new session for each connection. Sessions automatically clean up after
30 minutes of inactivity.

## Security Considerations

1. **Always use authentication** (`MCP_AUTH_TOKEN`) for remote access
2. **Use Tailscale or VPN** rather than exposing to the public internet
3. **Bind to localhost** if only accessing from the same Mac:
   ```bash
   node dist/index.js --http --host 127.0.0.1 --port 3000
   ```
4. **Generate strong tokens:**
   ```bash
   openssl rand -hex 32
   ```

## Comparison: stdio vs HTTP Transport

| Feature          | stdio (default)           | HTTP                               |
| ---------------- | ------------------------- | ---------------------------------- |
| Network access   | Same machine only         | Remote access                      |
| Setup complexity | Simple                    | Moderate                           |
| Authentication   | N/A (process isolation)   | Bearer token                       |
| Multiple clients | One at a time             | Concurrent                         |
| Use case         | Local Claude Desktop/Code | Windows PC, mobile, multiple users |

## What's Next

- **Streaming responses (Phase 2):** Future updates will support streaming progress for long-running analytics
- **Multiple concurrent sessions:** The architecture already supports multiple simultaneous users

## See Also

- [Getting Started](./GETTING_STARTED.md) - Initial setup guide
- [Troubleshooting](./TROUBLESHOOTING.md) - General troubleshooting
- [Design Document](../plans/2025-12-04-streamable-http-transport-design.md) - Technical architecture details

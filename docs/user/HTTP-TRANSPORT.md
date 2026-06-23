# Remote Access via HTTP Transport

Access OmniFocus on your Mac from another device (Windows PC, etc.) using HTTP transport.

## Overview

Default stdio transport requires the server on the same machine as OmniFocus. HTTP transport enables remote access from
any network device.

**Common Use Case:** Claude Desktop on Windows PC → OmniFocus on Mac.

## Client Compatibility

| Client          | stdio | HTTP/SSE                     |
| --------------- | ----- | ---------------------------- |
| Claude Desktop  | ✅    | ❌ (needs mcp-remote bridge) |
| Claude Code     | ✅    | ✅                           |
| Claude.ai (web) | -     | ✅ (Pro/Max/Team/Enterprise) |

## Prerequisites

- **Mac (server):** OmniFocus 4.7+, Node.js 18+, omnifocus-mcp installed
- **Client:** Claude Desktop (with Node.js) or Claude Code
- **Network:** Same network, or Tailscale/VPN

## Quick Start

### Step 1: Start Server on Mac

```bash
cd /path/to/omnifocus-mcp
node dist/index.js --http --port 3000
```

Wait for "HTTP server ready" (cache warming takes 8-22 seconds).

### Step 2: Configure Client

#### Option A: Claude Code (Native HTTP)

```bash
claude mcp add omnifocus --transport http http://YOUR-MAC-IP:3000/mcp
```

#### Option B: Claude Desktop (mcp-remote Bridge)

Install Node.js 18+ on Windows: https://nodejs.org

Edit config file:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`

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

Replace `YOUR-MAC-IP` with your Mac's IP (e.g., `192.168.1.100`) or Tailscale hostname.

### Step 3: Restart Client

Restart Claude Desktop or Claude Code completely.

## Secure Setup with Tailscale

For remote access outside your local network, use [Tailscale](https://tailscale.com/).

### On Mac:

1. Install Tailscale, log in
2. Note your hostname (e.g., `macbook.tailnet-name.ts.net`)
3. Generate auth token:
   ```bash
   export MCP_AUTH_TOKEN=$(openssl rand -hex 32)
   echo "Your auth token: $MCP_AUTH_TOKEN"
   ```
4. Start server: `node dist/index.js --http --port 3000`

### On Windows:

1. Install Tailscale (same account)
2. Install Node.js 18+
3. Configure Claude Desktop:

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
      "env": { "AUTH_TOKEN": "Bearer YOUR-SECRET-TOKEN" }
    }
  }
}
```

The `env` workaround avoids a Claude Desktop bug with spaces in args.

### With Claude Code:

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

## Running as Background Service (macOS)

### 1. Create plist

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

Update paths: Node.js (`which node`), installation path, and auth token.

### 2. Load service

```bash
launchctl load ~/Library/LaunchAgents/com.omnifocus.mcp.plist
```

### 3. Manage service

```bash
launchctl list | grep omnifocus          # Status
launchctl stop com.omnifocus.mcp         # Stop
launchctl start com.omnifocus.mcp        # Start
launchctl unload ~/Library/LaunchAgents/com.omnifocus.mcp.plist  # Remove
tail -f /tmp/omnifocus-mcp.log           # Logs
```

## HTTP Endpoints

| Path        | Method | Purpose                                  |
| ----------- | ------ | ---------------------------------------- |
| `/mcp`      | POST   | MCP JSON-RPC requests                    |
| `/mcp`      | GET    | Server-Sent Events stream                |
| `/mcp`      | DELETE | Session termination                      |
| `/health`   | GET    | Health check (returns `{"status":"ok"}`) |
| `/sessions` | GET    | Active session information               |

## Testing Connection

```bash
# From Mac
curl http://localhost:3000/health

# From Windows
curl http://YOUR-MAC-IP:3000/health

# With auth
curl -H "Authorization: Bearer YOUR-TOKEN" http://YOUR-MAC-IP:3000/health
```

## Troubleshooting

### "Connection refused"

1. Verify server: `curl http://localhost:3000/health` (on Mac)
2. Check firewall: System Settings > Network > Firewall > add Node.js
3. Test connectivity: `ping YOUR-MAC-IP` (from Windows)
4. Verify port: `lsof -i :3000` (on Mac)

### "401 Unauthorized"

- Verify `Authorization` header matches `MCP_AUTH_TOKEN`
- Use `env` workaround for "Bearer " prefix (see Tailscale section)

### mcp-remote fails

```powershell
node --version                                    # Need v18+
npx -y mcp-remote http://YOUR-MAC-IP:3000/mcp    # Test manually
npx clear-npx-cache                              # Clear cache if needed
```

### Claude Desktop doesn't see server

1. Valid JSON? (no trailing commas)
2. Fully restart Claude Desktop
3. Config uses `command: "npx"`, not `url`
4. Check logs: `%APPDATA%\Claude\Logs\` (Win) or `~/Library/Logs/Claude/` (Mac)

### Session created but times out

OmniFocus dialog may be blocking. Check OmniFocus is responsive.

### Sessions keep getting created

Normal. HTTP creates sessions per connection; they auto-cleanup after 30 minutes.

## Security

HTTP transport sends requests over **plain HTTP — there is no built-in TLS/encryption.** Both the bearer token and your
OmniFocus data travel across the network in cleartext. Authentication and encryption are separate concerns, and this
server provides only the former:

- The `MCP_AUTH_TOKEN` bearer token **authenticates** requests (proves the caller knows the secret).
- It does **not encrypt** them. Anyone who can observe the network path — another host on an untrusted LAN, public
  Wi-Fi, a compromised router — can read the token and your task data off the wire, and replay the token to impersonate
  you.

**A token alone is not transport security.** Treat it as a lock on the door, not as walls around the room.

### Safe deployment: wrap HTTP in an encrypted tunnel

Run the HTTP transport only over a network you fully trust, or wrap it in a VPN that supplies the transport encryption
this server does not:

- **Recommended — Tailscale (WireGuard):** the [Tailscale setup above](#secure-setup-with-tailscale) encrypts the entire
  tunnel end-to-end, so the cleartext HTTP inside it is protected. Bearer token + plain HTTP **inside** a Tailscale
  tunnel is the supported secure configuration.
- **Local-only:** bind to localhost (`--host 127.0.0.1`) when the client runs on the same machine — nothing leaves the
  host.

**Do not** expose the HTTP port directly to the public internet or to an untrusted LAN, even with `MCP_AUTH_TOKEN` set.
Without a VPN there is no transport encryption, so the token and your data are exposed regardless.

### Checklist

1. **Use a VPN/Tailscale** (or a fully trusted LAN) — never raw HTTP over an untrusted network.
2. **Always set `MCP_AUTH_TOKEN`** for any remote access.
3. **Bind to localhost** (`--host 127.0.0.1`) for same-machine-only use.
4. **Use strong tokens:** `openssl rand -hex 32`.

## stdio vs HTTP

| Feature | stdio             | HTTP         |
| ------- | ----------------- | ------------ |
| Network | Same machine      | Remote       |
| Setup   | Simple            | Moderate     |
| Auth    | Process isolation | Bearer token |
| Clients | One at a time     | Concurrent   |

## See Also

- [Getting Started](./GETTING_STARTED.md)
- [Troubleshooting](./TROUBLESHOOTING.md)
- [Design Document](../plans/2025-12-04-streamable-http-transport-design.md)

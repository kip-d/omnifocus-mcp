# Windows Setup: Claude Desktop + Remote OmniFocus

Connect Claude Desktop on Windows to OmniFocus MCP server running on your Mac.

## Prerequisites

| Machine | Requirements |
|---------|-------------|
| **Mac (server)** | OmniFocus 4.6+, Node.js 18+, omnifocus-mcp installed |
| **Windows (client)** | Claude Desktop, Node.js 18+ |
| **Network** | Both on same network (or Tailscale) |

## Setup

### Step 1: Start the Server (Mac)

```bash
cd /path/to/omnifocus-mcp
npm run build
node dist/index.js --http --port 3000
```

Wait for this message before proceeding:
```
[INFO] HTTP server ready and accepting connections
```

**Find your Mac's IP:**
```bash
ipconfig getifaddr en0
```

### Step 2: Test Connectivity (Windows)

Open PowerShell and verify you can reach the Mac:

```powershell
curl http://YOUR-MAC-IP:3000/health
```

Expected response:
```json
{"status":"ok","version":"3.0.0",...}
```

If this fails, check:
- Mac firewall (System Settings > Network > Firewall)
- Both machines on same network
- Correct IP address

### Step 3: Install Node.js (Windows)

Download and install from: https://nodejs.org (LTS version)

Verify installation:
```powershell
node --version
npx --version
```

### Step 4: Configure Claude Desktop (Windows)

Edit the config file at: `%APPDATA%\Claude\claude_desktop_config.json`

**Quick way to open it:**
```powershell
notepad $env:APPDATA\Claude\claude_desktop_config.json
```

**Add this configuration:**

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

Replace `YOUR-MAC-IP` with the IP from Step 1.

### Step 5: Restart Claude Desktop

1. Fully quit Claude Desktop (check system tray)
2. Reopen Claude Desktop
3. Wait ~10 seconds for mcp-remote to connect

### Step 6: Test It

Ask Claude:
- "What's in my OmniFocus inbox?"
- "Show my tasks due today"
- "Create a task called 'Test from Windows'"

## Troubleshooting

### "Cannot connect" or timeout

1. **Verify server is running** on Mac:
   ```bash
   curl http://localhost:3000/health
   ```

2. **Test from Windows**:
   ```powershell
   curl http://YOUR-MAC-IP:3000/health
   ```

3. **Check Mac firewall** allows Node.js connections

### Claude doesn't show OmniFocus tools

1. Check config file syntax (valid JSON, no trailing commas)
2. Restart Claude Desktop completely
3. Check Claude logs: `%APPDATA%\Claude\Logs\`

### mcp-remote errors

Test it manually:
```powershell
npx -y mcp-remote http://YOUR-MAC-IP:3000/mcp
```

If this hangs or errors, the issue is network connectivity.

## With Tailscale (Recommended for Remote Access)

If the machines aren't on the same local network:

1. Install Tailscale on both Mac and Windows
2. Use Mac's Tailscale hostname instead of IP:

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://your-mac.tailnet-name.ts.net:3000/mcp"]
    }
  }
}
```

## With Authentication (Optional)

For added security:

**On Mac:**
```bash
export MCP_AUTH_TOKEN=$(openssl rand -hex 32)
echo "Token: $MCP_AUTH_TOKEN"  # Save this!
node dist/index.js --http --port 3000
```

**On Windows** (config file):
```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://YOUR-MAC-IP:3000/mcp",
        "--header",
        "Authorization:${AUTH_TOKEN}"
      ],
      "env": {
        "AUTH_TOKEN": "Bearer YOUR-TOKEN-HERE"
      }
    }
  }
}
```

## Quick Reference

| Item | Value |
|------|-------|
| Server endpoint | `http://MAC-IP:3000/mcp` |
| Health check | `http://MAC-IP:3000/health` |
| Config file (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Bridge tool | `mcp-remote` (via npx) |

# Windows Setup: Claude Desktop + Remote OmniFocus

Connect Claude Desktop on Windows to OmniFocus MCP server running on your Mac.

## Prerequisites

| Machine | Requirements |
|---------|-------------|
| **Mac (server)** | OmniFocus 4.6+, Node.js 18+, omnifocus-mcp installed |
| **Windows (client)** | Claude Desktop, Node.js 18+ |
| **Network** | Both on same network (or Tailscale) |

## Setup

### Step 1: Start Server (Mac)

```bash
cd /path/to/omnifocus-mcp
npm run build
node dist/index.js --http --port 3000
# Wait for "HTTP server ready"

ipconfig getifaddr en0  # Get Mac's IP
```

### Step 2: Test Connectivity (Windows PowerShell)

```powershell
curl http://YOUR-MAC-IP:3000/health
# Should return {"status":"ok",...}
```

If this fails: check Mac firewall, verify same network, confirm IP.

### Step 3: Install Node.js (Windows)

Install from https://nodejs.org (LTS), then verify:
```powershell
node --version  # Need v18+
```

### Step 4: Configure Claude Desktop (Windows)

```powershell
notepad $env:APPDATA\Claude\claude_desktop_config.json
```

Add (replace `YOUR-MAC-IP`):
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

### Step 5: Restart and Test

1. Fully quit Claude Desktop (check system tray)
2. Reopen, wait ~10 seconds
3. Ask: "What's in my OmniFocus inbox?"

## Troubleshooting

| Problem | Check |
|---------|-------|
| Cannot connect | `curl http://localhost:3000/health` (Mac), firewall settings |
| No OmniFocus tools | Config JSON valid? Fully restart Claude. Check `%APPDATA%\Claude\Logs\` |
| mcp-remote errors | `npx -y mcp-remote http://YOUR-MAC-IP:3000/mcp` (test manually) |

## With Tailscale (Remote Access)

Install Tailscale on both machines, then use hostname instead of IP:
```json
{ "args": ["-y", "mcp-remote", "http://your-mac.tailnet-name.ts.net:3000/mcp"] }
```

## With Authentication

**Mac:**
```bash
export MCP_AUTH_TOKEN=$(openssl rand -hex 32)
echo "Token: $MCP_AUTH_TOKEN"  # Save this!
node dist/index.js --http --port 3000
```

**Windows config:**
```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://YOUR-MAC-IP:3000/mcp",
               "--header", "Authorization:${AUTH_TOKEN}"],
      "env": { "AUTH_TOKEN": "Bearer YOUR-TOKEN-HERE" }
    }
  }
}
```

## Quick Reference

| Item | Value |
|------|-------|
| Server | `http://MAC-IP:3000/mcp` |
| Health | `http://MAC-IP:3000/health` |
| Config | `%APPDATA%\Claude\claude_desktop_config.json` |

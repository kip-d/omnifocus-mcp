# Claude Desktop Configuration

## Current Working Configuration

After troubleshooting, the working configuration for OmniFocus MCP is:

```json
{
  "omnifocus": {
    "command": "/Users/guillaume/.nvm/versions/node/v20.19.1/bin/omnifocus-mcp",
    "args": []
  }
}
```

## Important Notes

1. **Direct path required**: Claude Desktop was using an old Node version (v14), so we use the full path to the executable
2. **Global installation**: The package is installed globally with `npm install -g omnifocus-mcp`
3. **No npx**: The npx approach had issues with argument parsing

## For New Implementations

### Cache Architecture Configuration
```json
{
  "omnifocus-cache": {
    "command": "/path/to/node",
    "args": ["/path/to/omnifocus-mcp-cache/dist/server.js"]
  }
}
```

### Plugin Architecture Configuration
```json
{
  "omnifocus-plugin": {
    "command": "/path/to/node", 
    "args": ["/path/to/omnifocus-mcp-plugin/dist/server.js"]
  }
}
```

## Troubleshooting

Check logs at: `/Users/guillaume/Library/Logs/Claude/mcp-server-omnifocus.log`

Common issues:
- Wrong Node version
- Missing command arguments
- Path resolution problems
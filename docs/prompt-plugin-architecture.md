# Claude Code Prompt: Build OmniFocus MCP Server (Plugin Architecture)

## Project Overview

Create a Model Context Protocol (MCP) server for OmniFocus using a **Plugin + Local Server architecture**:
- OmniFocus plugin (using OmniAutomation) runs an HTTP server inside OmniFocus
- MCP server connects to this local HTTP endpoint
- Real-time data access without process spawning overhead
- Event-driven updates from OmniFocus

## Technical Architecture

### Core Stack
- **Plugin Side**: OmniAutomation JavaScript plugin with HTTP server
- **MCP Side**: TypeScript Node.js MCP server
- **Communication**: HTTP/WebSocket between plugin and MCP server
- **Protocol**: JSON-RPC or REST API

### Architecture Pattern: Plugin + Local Server
```
Claude Desktop <-> MCP Server <-HTTP/WS-> OmniFocus Plugin (HTTP Server) <-> OmniFocus Data
```

## Implementation Requirements

### 1. Project Structure
```
omnifocus-mcp-plugin/
├── plugin/                         # OmniFocus Plugin
│   ├── manifest.json              # Plugin metadata
│   ├── server.js                  # HTTP/WebSocket server
│   ├── api/
│   │   ├── tasks.js              # Task endpoints
│   │   ├── projects.js           # Project endpoints
│   │   ├── analytics.js          # Analytics endpoints
│   │   └── events.js             # Event streaming
│   ├── lib/
│   │   ├── HttpServer.js         # Server implementation
│   │   └── Router.js             # Route handling
│   └── Resources/
│       └── icon.png              # Plugin icon
├── mcp-server/                    # MCP Server
│   ├── src/
│   │   ├── server.ts             # MCP server
│   │   ├── client/
│   │   │   ├── OmniFocusClient.ts   # HTTP client for plugin
│   │   │   └── WebSocketClient.ts   # Real-time updates
│   │   ├── tools/
│   │   │   ├── tasks/
│   │   │   ├── projects/
│   │   │   └── analytics/
│   │   └── types/
│   ├── package.json
│   └── tsconfig.json
└── install.sh                     # Installation script
```

### 2. Plugin Implementation

#### HTTP Server in OmniFocus
```javascript
// plugin/server.js
(() => {
    const port = 39849; // Fixed port for MCP connection
    const server = new HttpServer(port);
    
    // REST endpoints
    server.get('/api/tasks', handlers.listTasks);
    server.post('/api/tasks', handlers.createTask);
    server.put('/api/tasks/:id', handlers.updateTask);
    
    // WebSocket for real-time updates
    server.ws('/events', (ws) => {
        // Stream task changes
        Document.addEventListener('TaskChanged', (event) => {
            ws.send(JSON.stringify({
                type: 'task.changed',
                data: event.task
            }));
        });
    });
    
    server.start();
    
    // Register URL handler for plugin control
    URL.fromString('omnifocus:///mcp/start').open();
})();
```

#### Plugin Capabilities
- Start/stop HTTP server on demand
- Handle authentication tokens
- Stream real-time changes
- Expose full OmniAutomation API via HTTP
- Manage server lifecycle

### 3. MCP Server Implementation

#### HTTP Client
```typescript
class OmniFocusClient {
    constructor(private baseUrl = 'http://localhost:39849') {}
    
    async getTasks(filter?: TaskFilter): Promise<Task[]> {
        const response = await fetch(`${this.baseUrl}/api/tasks`, {
            method: 'POST',
            body: JSON.stringify(filter)
        });
        return response.json();
    }
    
    subscribeToChanges(callback: (event: ChangeEvent) => void) {
        const ws = new WebSocket(`ws://localhost:39849/events`);
        ws.on('message', (data) => {
            callback(JSON.parse(data));
        });
    }
}
```

### 4. Plugin Features

#### Core Endpoints
- `GET /api/health` - Plugin status and version
- `GET /api/tasks` - List tasks with filtering
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `GET /api/analytics` - Productivity metrics
- `WS /events` - Real-time event stream

#### Advanced Features
- Batch operations endpoint
- Transaction support
- Custom query language
- Perspective support
- Attachment handling

### 5. Security & Authentication

```javascript
// Plugin side
const tokens = new Map();

server.use((req, res, next) => {
    const token = req.headers['x-auth-token'];
    if (!tokens.has(token)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
});

// Generate token for MCP server
const mcpToken = generateToken();
tokens.set(mcpToken, { name: 'mcp-server', created: new Date() });
```

### 6. Real-time Capabilities

Implement WebSocket events for:
- Task created/updated/deleted
- Project changes
- Tag modifications
- Focus changes
- Review cycle updates

### 7. Plugin Management

#### Installation
```bash
# install.sh
#!/bin/bash
PLUGIN_DIR="$HOME/Library/Containers/com.omnigroup.OmniFocus3/Data/Library/Application Support/Plug-Ins"
cp -r plugin/ "$PLUGIN_DIR/OmniFocus-MCP.omnifocusjs"
echo "Plugin installed. Restart OmniFocus to activate."
```

#### Auto-start
- Plugin starts server when OmniFocus launches
- MCP server auto-discovers plugin via health endpoint
- Graceful reconnection handling

### 8. Error Handling

Plugin side:
- Sandbox permission errors
- Network binding failures
- Memory management
- Crash recovery

MCP side:
- Connection retry logic
- Request timeout handling
- Graceful degradation

### 9. Performance Optimizations

- Connection pooling
- Response streaming for large datasets
- Pagination support
- Query optimization
- Memory-efficient data serialization

### 10. Testing Strategy

- Mock HTTP server for MCP tests
- Plugin test harness
- Integration tests with real OmniFocus
- Load testing for concurrent requests
- WebSocket reliability tests

## Key Advantages of This Architecture

1. **Real-time Updates**: WebSocket push from OmniFocus
2. **High Performance**: No process spawning, direct data access
3. **Rich Features**: Full access to OmniAutomation API
4. **Event-Driven**: React to changes instantly
5. **Persistent Connection**: Maintain state between requests

## Development Workflow

1. Start with plugin HTTP server basics
2. Implement core REST endpoints
3. Build MCP server with HTTP client
4. Add WebSocket for real-time updates
5. Implement authentication
6. Add advanced analytics
7. Create installer and documentation

## Deliverables

1. **OmniFocus Plugin** (.omnifocusjs)
   - HTTP/WebSocket server
   - Full API implementation
   - Auto-start capability
   - Token management

2. **MCP Server Package**
   - npm package: `omnifocus-mcp-plugin`
   - TypeScript with full types
   - Automatic plugin discovery
   - Comprehensive tool set

3. **Installation Tools**
   - One-click installer script
   - Plugin management commands
   - Health monitoring

## Critical Requirements

- **OmniFocus Pro**: Required for plugin support
- **Port Management**: Handle port conflicts gracefully
- **Security**: Implement proper authentication
- **Reliability**: Auto-reconnect and error recovery
- **Performance**: Handle 10k+ tasks smoothly

Start by creating the basic plugin structure and HTTP server, then build the MCP server to connect to it. Focus on getting bi-directional communication working before adding features.
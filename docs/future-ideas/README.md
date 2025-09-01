# Future Enhancement Ideas

This directory contains proposals for potential future enhancements to the OmniFocus MCP server. These ideas have been designed but not yet implemented, and represent opportunities for contributors to extend the system's capabilities.

## Status of Ideas

### 🚧 In Progress
- **Pattern Analysis System** - Working implementation on `pattern-analysis` branch
  - Implemented patterns: duplicates, dormant projects, tag audits, deadline health, waiting-for analysis
  - See branch: `git checkout origin/pattern-analysis`
  - Note: The original blueprint proposed advanced features (embeddings, sharding, hierarchical summaries) not yet implemented

### 💡 Available for Implementation

#### 1. MCP Resources System (`mcp-resources.md`)
**Priority**: Medium  
**Complexity**: Medium  
**Benefits**:
- Direct data access without tool calls
- Natural caching integration  
- Performance improvements for read-heavy operations
- Intuitive URI scheme (e.g., `omnifocus://projects/active`)

#### 2. Consent and Security Layer (`consent-security.md`)
**Priority**: High  
**Complexity**: High  
**Benefits**:
- Explicit consent for bulk operations
- Data access audit logging
- Sensitive data detection and protection
- Configurable permission levels

## How to Contribute

1. **Choose an idea** from the "Available for Implementation" section
2. **Create a feature branch** named after the feature (e.g., `mcp-resources`)
3. **Follow the proposal** in the corresponding `.md` file
4. **Add comprehensive tests** for your implementation
5. **Update documentation** including API references
6. **Submit a PR** referencing the proposal

## Why These Ideas Matter

These proposals were created based on:
- MCP specification best practices
- User feedback and requests
- Performance optimization opportunities
- Security and privacy considerations

Each proposal includes detailed implementation plans, technical considerations, and expected benefits.

## Already Implemented

✅ **MCP Prompts for GTD Workflows** - Implemented in v2.0.0
- 9 prompts for GTD workflows and reference guides
- Available in Claude Desktop v0.12.55+
- Source: `src/prompts/`
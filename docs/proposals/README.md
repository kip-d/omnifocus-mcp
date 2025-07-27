# OmniFocus MCP Enhancement Proposals

This directory contains detailed implementation proposals for enhancing the OmniFocus MCP server. These were originally stored as GitHub issue templates but are actually comprehensive architectural proposals.

## Proposals

### 1. MCP Resources Implementation (`mcp-resources-implementation.md`)
**Status**: Not Started  
**Priority**: Medium  
**Description**: Implement MCP resource system for direct data access without tool calls. This would provide performance benefits for read-heavy operations and better data discovery.

**Key Features**:
- Direct access to projects, tasks, and tags via resource URIs
- Natural caching integration
- Performance improvements for data browsing
- Intuitive URI scheme (e.g., `omnifocus://projects/active`)

### 2. MCP Prompts for GTD Workflows (`mcp-prompts-gtd-workflows.md`)
**Status**: Not Started  
**Priority**: Low  
**Description**: Add guided GTD workflows using MCP prompts to help users follow best practices for task management.

**Key Workflows**:
- Weekly Review
- Inbox Processing
- Daily Planning
- Project Planning (Natural Planning Model)

### 3. Consent and Security Implementation (`consent-and-security-implementation.md`)
**Status**: Not Started  
**Priority**: High  
**Description**: Implement comprehensive consent mechanisms and data access transparency for sensitive operations.

**Key Features**:
- Explicit consent for bulk operations
- Data access audit logging
- Sensitive data detection and protection
- Configurable permission levels

## Implementation Order

Based on user benefit and MCP compliance, suggested implementation order:

1. **Consent and Security** - Critical for user trust and MCP compliance
2. **MCP Resources** - Significant performance benefits and better data access
3. **MCP Prompts** - Enhanced user experience for GTD practitioners

## How to Contribute

1. Choose a proposal to implement
2. Create a feature branch
3. Follow the implementation plan in the proposal
4. Add comprehensive tests
5. Update documentation
6. Submit PR referencing the proposal

## Related Documentation

- [MCP Specification](https://github.com/anthropics/model-context-protocol)
- [Project README](../../README.md)
- [Architecture Overview](../../CLAUDE.md)
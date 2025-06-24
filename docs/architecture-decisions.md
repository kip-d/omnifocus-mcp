# Architecture Decisions

## Overview

This document captures the key architectural decisions for the OmniFocus MCP server project.

## Constraint: Respect OmniFocus APIs

We will only use official OmniFocus APIs:
- OmniAutomation JavaScript API
- URL schemes (omnifocus://)
- Published plugin interfaces

We will NOT:
- Access the SQLite database directly
- Use private/undocumented APIs
- Reverse engineer internal protocols

## Two Parallel Architectures

### Architecture 1: OmniAutomation with Smart Caching

**Technology Stack:**
- Node.js with TypeScript
- MCP SDK for protocol implementation
- OmniAutomation scripts executed via osascript
- In-memory cache with configurable TTLs

**Pros:**
- Simple deployment (npm package)
- Works with all OmniFocus versions
- No special requirements
- Stable API surface

**Cons:**
- Performance overhead (process spawning)
- No real-time updates
- Limited by script execution speed

### Architecture 2: OmniFocus Plugin + Local Server

**Technology Stack:**
- OmniFocus plugin running HTTP/WebSocket server
- Node.js MCP server as client
- Direct OmniAutomation access inside OmniFocus
- Real-time event streaming

**Pros:**
- High performance (no process spawning)
- Real-time updates via WebSocket
- Direct access to OmniFocus internals
- Can register URL handlers

**Cons:**
- Requires OmniFocus Pro
- More complex deployment
- Plugin needs manual installation
- Port management complexity

## Key Design Principles

1. **Type Safety**: Full TypeScript coverage
2. **Performance**: Cache aggressively but intelligently
3. **Reliability**: Graceful error handling
4. **Analytics**: First-class productivity insights
5. **Maintainability**: Clean architecture, good tests

## Performance Targets

- Handle 1000+ tasks without degradation
- Sub-100ms response for cached queries
- Sub-500ms for fresh data queries
- Real-time updates within 100ms (plugin architecture)

## Security Considerations

- Authentication tokens for plugin HTTP server
- No storage of sensitive OmniFocus data
- Respect macOS sandbox restrictions
- Local-only communication (no network exposure)
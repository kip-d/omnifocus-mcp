# OmniFocus API TypeScript Definitions

This directory contains the official TypeScript definitions for OmniFocus automation.

## File: OmniFocus.d.ts

- **Version**: OmniFocus 4.6.1 (182.3) on macOS 15.5
- **Generated**: 2025-07-24 12:55:10 +0000
- **Size**: 59KB

## Usage

These definitions provide type information for all OmniFocus automation objects and methods available through JavaScript for Automation (JXA).

### Key Classes:
- `Task` - Core task management
- `Project` - Project management  
- `Tag` - Tag management
- `Document` - Document-level operations
- `Database` - Database operations
- `Perspective` - Perspective management

### Important Notes:
1. These are the official API definitions from OmniGroup
2. They represent the actual automation interface available in OmniFocus 4.6.1
3. Some methods in these definitions may behave differently in JXA context
4. Always test automation scripts in OmniFocus before relying on them

## Integration with MCP Bridge

The MCP bridge uses these definitions as a reference for:
- Correct method signatures
- Available properties and methods
- Type safety in our TypeScript code
- Understanding OmniFocus object relationships
# Swift vs JXA Analysis for OmniFocus MCP

## Executive Summary
**Recommendation: STAY WITH JXA** - Continue with the current TypeScript/JXA implementation rather than rewriting in Swift.

## Current JXA Implementation

### What's Working Well
1. **Core CRUD Operations**: ✅ All task/project/folder operations work
2. **Complex Filtering**: ✅ whose() clauses with multiple predicates
3. **Recurrence**: ✅ Solved via evaluateJavascript() bridge (major breakthrough)
4. **Performance**: ✅ Acceptable with caching (1-2s for typical queries)
5. **Export/Import**: ✅ JSON, CSV, Markdown export working
6. **Analytics**: ✅ Productivity stats, velocity tracking implemented
7. **Review Management**: ✅ Project review schedules working
8. **Date Handling**: ✅ Relative dates, timezone support implemented

### Current Limitations
1. **Perspectives**: ❌ Not accessible via JXA API (potential UI scripting workaround)
2. **Batch Transactions**: ❌ No atomic operations (must implement in application layer)
3. **Tag Creation During Task Creation**: ⚠️ Must update after creation (minor inconvenience)
4. **Complex Date Queries**: ⚠️ Limited by whose() syntax (workarounds exist)

## Swift MCP Server Option

### Pros
1. **Native macOS Integration**: Direct ScriptingBridge or AppleScript-ObjC
2. **Better Performance**: Potentially faster execution
3. **Type Safety**: Compile-time checking
4. **Modern Language**: Active development, better tooling
5. **MCP SDK Available**: Official swift-sdk v0.10.0 exists

### Cons
1. **SAME OMNIFOCUS API LIMITATIONS**: Swift would still use the same OmniFocus scripting interface
2. **Complete Rewrite**: 20,000+ lines of working code to port
3. **Loss of npm Ecosystem**: No direct access to Node.js packages
4. **Deployment Complexity**: Binary distribution vs simple npm install
5. **Cross-Platform Issues**: Harder to develop/test on non-Mac systems
6. **Learning Curve**: New language, new SDK, new patterns
7. **Less MCP Community Support**: Most MCP servers are TypeScript/Python

## Critical Insight: The API is the Bottleneck

### OmniFocus Scripting Options (Same for ALL Languages)
1. **AppleScript/JXA Dictionary**: What we're using now
2. **URL Schemes**: Limited to basic operations
3. **Omni Automation (JavaScript)**: What we access via evaluateJavascript()
4. **Direct Database**: ⚠️ Unsupported, risky, would break with updates

**Swift would use the EXACT SAME scripting dictionary** - it doesn't magically get more access to OmniFocus internals.

## Cost-Benefit Analysis

### Effort to Rewrite in Swift
- **Time Estimate**: 2-3 months full-time
- **Risk**: High (new bugs, missing features, compatibility issues)
- **Testing**: Need to rewrite entire test suite
- **Documentation**: Complete rewrite needed

### Potential Gains
- **Performance**: Maybe 20-30% faster (but already fast enough with caching)
- **Type Safety**: Nice to have, but TypeScript already provides this
- **Native Feel**: Irrelevant for MCP server (runs in background)

### What We'd Lose
- **249 Working Tests**: All need rewriting
- **Battle-Tested Code**: Current implementation handles edge cases
- **evaluateJavascript() Bridge**: Would need to reimplement
- **Community Contributions**: TypeScript is more accessible
- **Quick Iterations**: npm ecosystem allows rapid prototyping

## The Perspective Problem

The main limitation you're worried about (Perspectives) has potential solutions in JXA:

### Option 1: UI Scripting (JXA)
```javascript
// This works in JXA today
const se = Application('System Events');
const omnifocus = se.processes['OmniFocus'];
const perspectiveMenu = omnifocus.menuBars[0].menuItems['Perspectives'];
// Can click on perspective menu items
```

### Option 2: URL Schemes
```javascript
// OmniFocus supports opening perspectives via URLs
app.openLocation('omnifocus:///perspective/Review');
```

### Option 3: Omni Automation Bridge
```javascript
// Potentially accessible via evaluateJavascript()
// Need to investigate Perspective object in Omni Automation
```

## Recommendation: Incremental Improvements

### Instead of Rewriting, Focus On:

1. **Implement Batch Operations** (1 week)
   - Use existing tools with transaction wrapper
   - Add rollback on failure

2. **Solve Perspectives Access** (1 week)
   - Try UI scripting approach first
   - Investigate Omni Automation API
   - Fallback to URL schemes

3. **Performance Optimizations** (ongoing)
   - Smarter caching strategies
   - Parallel script execution
   - Lazy loading patterns

4. **Create Swift Helper Tool** (optional, 2 days)
   - Small Swift binary for specific operations
   - Call from Node.js when needed
   - Best of both worlds

## If You Must Use Swift

### Hybrid Approach (Recommended if switching)
```typescript
// Keep TypeScript MCP server as orchestrator
// Use Swift for specific operations

// swift-helper/Sources/OmniFocusHelper.swift
import ScriptingBridge
// ... Swift code for special operations ...

// In TypeScript
const result = await exec('swift-helper perspective-list');
```

### Full Swift Rewrite (Not Recommended)
- Use modelcontextprotocol/swift-sdk
- Port all TypeScript logic systematically
- Maintain feature parity before adding new features
- Budget 3+ months for production-ready version

## Conclusion

**Your current JXA implementation is not the limiting factor** - the OmniFocus scripting API is. Swift wouldn't give you more capabilities, just a different syntax for the same limitations.

The `evaluateJavascript()` bridge you discovered is actually MORE powerful than what a pure Swift implementation would have, because it accesses Omni Automation features that aren't in the AppleScript dictionary.

### Action Items
1. ✅ Document current capabilities comprehensively
2. ✅ Accept that some limitations are OmniFocus API limitations, not JXA
3. 🔄 Implement workarounds for must-have features (like Perspectives)
4. 📈 Continue incremental improvements on current codebase
5. ⏸️ Defer Swift rewrite unless you hit an absolute showstopper

**Remember**: You have 249 passing tests, happy users, and a working solution. Don't let perfect be the enemy of good!
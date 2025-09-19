# LLM Assistant Simulation Tests

This directory contains integration tests that simulate how an LLM assistant (like Claude) would interact with our OmniFocus MCP server. These tests provide valuable insights into the real-world usage patterns and help ensure our tools work correctly in practice.

## What These Tests Do

The tests simulate realistic conversation flows where an LLM assistant:

1. **Discovers available tools** - Like Claude does when first connecting
2. **Chains multiple tool calls** - To accomplish complex user requests
3. **Handles errors gracefully** - When tools fail or return unexpected data
4. **Maintains data consistency** - Across multiple tool calls
5. **Follows realistic workflows** - GTD reviews, project planning, task management

## Test Scenarios

### 📋 **Basic Scenarios**
- **"What should I work on today?"** - Today's tasks + overdue analysis + productivity context
- **"Create a vacation project"** - Project creation + task addition + verification
- **"Show me productive tags"** - Tag statistics + productivity correlation

### 🔄 **Complex Workflows**
- **Weekly GTD Review** - Multi-tool analysis for comprehensive review
- **Tool Chaining** - Find urgent task → flag it (like real assistant behavior)
- **Data Consistency** - Verify task counts match across different tools

### ❌ **Error Handling**
- Invalid parameters (missing required fields)
- Non-existent tools
- OmniFocus not running scenarios

## Running the Tests

### Prerequisites
```bash
# Build the server first
npm run build

# Optional: Have OmniFocus running for full functionality tests
# Tests will still pass if OmniFocus isn't running - they just test error handling
```

### Enable LLM Simulation Tests
```bash
# Set environment variable to enable these tests
export ENABLE_LLM_SIMULATION_TESTS=true

# Run the LLM simulation tests
npm test tests/integration/llm-assistant-simulation.test.ts

# Or run all integration tests
npm run test:integration
```

### Without OmniFocus Running
The tests are designed to be meaningful even when OmniFocus isn't running:
- Tests verify proper error handling and error message quality
- Tests ensure MCP protocol compliance
- Tests validate tool discovery and parameter validation

### With OmniFocus Running
When OmniFocus is available, tests additionally verify:
- Actual data retrieval and processing
- Tool chaining with real data
- Cross-tool data consistency
- Realistic workflow completion

## Test Structure

Each test scenario follows this pattern:

```typescript
describe('Scenario: User request simulation', () => {
  it('should perform initial tool discovery', async () => {
    // Simulate LLM discovering available tools
  });

  it('should execute primary tool calls', async () => {
    // Simulate main workflow steps
  });

  it('should chain tools for complex requests', async () => {
    // Simulate multi-step assistant behavior
  });
});
```

## Key Features

### 🤖 **LLMAssistantSimulator Class**
Simulates how an LLM assistant communicates with MCP servers:
- Proper MCP protocol initialization
- Tool discovery and parameter handling
- Error handling and response parsing
- Message correlation and timeouts

### 📊 **Realistic Data Flows**
Tests mirror actual Claude Desktop usage:
- Multiple tool calls to build context
- Tool chaining for complex workflows
- Error recovery and graceful degradation
- Data consistency validation

### 🔍 **Comprehensive Coverage**
- **Protocol compliance** - Proper MCP message flow
- **Tool functionality** - Real-world usage patterns
- **Error scenarios** - Graceful failure handling
- **Performance** - Response times and data quality

## Example Output

```bash
✓ Scenario: User asks "What should I work on today?"
  ✓ should discover available tools first
  ✓ should get today's tasks like an LLM assistant would
  ✓ should get overdue tasks for priority assessment
  ✓ should check productivity stats for context

✓ Scenario: User says "Create a new project for planning my vacation"
  ✓ should create a project like an LLM assistant would
  ✓ should add tasks to the project systematically
  ✓ should verify the project was created properly
```

## Benefits

### 🎯 **Real-World Validation**
- Tests actual LLM usage patterns vs. theoretical API coverage
- Identifies tools that are hard to use in practice
- Validates error messages are helpful to LLMs

### 🔧 **Development Insights**
- Shows which tool combinations are most valuable
- Identifies missing functionality gaps
- Reveals performance bottlenecks in realistic scenarios

### 📈 **Quality Assurance**
- Ensures tools work together seamlessly
- Validates MCP protocol compliance
- Tests error handling under realistic conditions

## Adding New Scenarios

To add new test scenarios:

1. **Identify a realistic user request** - "Plan my week", "Review stuck projects", etc.
2. **Map the LLM workflow** - What tools would Claude call and in what order?
3. **Create test scenario** - Follow the existing pattern with setup, execution, validation
4. **Test both success and failure paths** - OmniFocus available vs. not available

```typescript
describe('Scenario: Your new user request', () => {
  it('should handle the request like an LLM assistant', async () => {
    // Step 1: What tool would the LLM call first?
    const firstResult = await assistant.callTool('tool_name', {
      // realistic parameters
    });

    // Step 2: How would it use that data for the next call?
    if (firstResult.success) {
      const secondResult = await assistant.callTool('another_tool', {
        // parameters derived from first result
      });

      // Validate the workflow
      expect(secondResult).toHaveProperty('success');
    }
  });
});
```

This testing approach gives us confidence that our MCP server works well with real LLM assistants, not just in isolation.
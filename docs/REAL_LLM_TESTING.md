# Real LLM Testing with Ollama

This guide covers the Real LLM Testing feature that validates our MCP server with actual AI models instead of just scripted simulations.

## Overview

Real LLM Testing uses **Ollama** to run local AI models that interact with our MCP server through natural language queries. This validates:

- **Tool descriptions guide AI decisions correctly**
- **Natural language understanding works as expected**
- **Complex workflows can be executed by real AI reasoning**
- **Emergent behaviors and tool chaining work properly**

## Quick Start

### 1. Install Ollama

```bash
# macOS/Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Or visit https://ollama.ai/download for manual installation
```

### 2. Start Ollama

```bash
ollama serve
```

### 3. Setup Models and Environment

```bash
# Setup recommended models automatically
npm run setup-real-llm setup

# Or just validate if environment is ready
npm run setup-real-llm validate
```

### 4. Run Real LLM Tests

```bash
# Run all real LLM integration tests
npm run test:real-llm

# Or run manually with environment variable
ENABLE_REAL_LLM_TESTS=true npx vitest tests/integration/real-llm-integration.test.ts
```

## Model Recommendations

### ⭐ Recommended Models

| Model | Size | Description | Use Case |
|-------|------|-------------|----------|
| **phi3.5:3.8b** | 2.2GB | Microsoft Phi-3.5 | Best balance of performance and speed |
| **qwen2.5:0.5b** | 352MB | Qwen2.5 0.5B | Ultra-fast for CI/CD testing |

### Optional Models

| Model | Size | Description |
|-------|------|-------------|
| qwen2.5:1.5b | 934MB | Good performance, reasonable size |
| llama3.2:1b | 1.3GB | Meta's efficient model |
| llama3.2:3b | 2.0GB | Better reasoning capabilities |

### Installation

```bash
# Download specific models
ollama pull phi3.5:3.8b
ollama pull qwen2.5:0.5b

# Or use our setup script
npm run setup-real-llm setup
```

## What's Tested

### Natural Language Understanding

- **"What should I work on today?"** → Uses `tasks` tool with today mode
- **"Show me my overdue tasks"** → Uses `analyze_overdue` tool
- **"How productive was I this week?"** → Uses `productivity_stats` tool

### Complex Workflows

- **Multi-step planning requests** → Uses multiple tools in logical sequence
- **Emotional queries** ("I feel overwhelmed") → Demonstrates sophisticated tool selection
- **Context-aware responses** → Chains tools based on previous results

### Tool Description Validation

- Verifies that tool descriptions guide AI decisions correctly
- Tests parameter selection based on natural language context
- Validates error handling and recovery

### Emergent Behavior Discovery

- Tests unexpected but valid tool combinations
- Validates AI reasoning about tool sequencing
- Discovers natural language patterns that work well

## Test Structure

### RealLLMTestHarness Class

The test harness provides:

```typescript
class RealLLMTestHarness {
  // Initialize MCP server connection and Ollama
  async initialize(): Promise<void>

  // Send natural language query and get AI response + tool usage
  async askLLM(query: string, model?: string): Promise<{
    response: string;           // AI's natural language response
    toolCalls: ToolCall[];      // Actual MCP tool calls made
    reasoning: string[];        // AI's reasoning process
  }>

  // Discover available MCP tools
  async discoverTools(): Promise<MCPTool[]>
}
```

### Test Categories

1. **Natural Language Query Processing**
   - Basic tool selection from natural language
   - Parameter inference from context
   - Response quality validation

2. **Complex Workflow Understanding**
   - Multi-step request handling
   - Tool chaining logic
   - Emergent behavior discovery

3. **Tool Description Validation**
   - Verify descriptions guide decisions correctly
   - Test parameter selection accuracy
   - Validate expected tool usage

4. **Error Handling and Recovery**
   - Graceful failure handling
   - Tool error recovery
   - Reasoning under uncertainty

5. **Performance and Resource Usage**
   - Response time validation
   - Resource efficiency with small models
   - Scalability testing

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_REAL_LLM_TESTS` | `false` | Enable real LLM tests (required) |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama server URL |

## Comparison: Simulation vs Real LLM Testing

### LLM Simulation Tests (Existing)
- ✅ **Fast & Deterministic** - Perfect for CI/CD
- ✅ **No external dependencies** - Always available
- ✅ **Predictable behavior** - Tests specific scenarios
- ❌ **Scripted workflows** - Not actual AI reasoning
- ❌ **Limited discovery** - Can't find emergent behaviors

### Real LLM Tests (New)
- ✅ **Actual AI reasoning** - Tests real-world usage
- ✅ **Natural language** - Tests tool descriptions
- ✅ **Emergent discovery** - Finds unexpected behaviors
- ✅ **Production-like** - Similar to Claude Desktop
- ❌ **Requires setup** - Ollama + models needed
- ❌ **Resource intensive** - Slower than simulations

## Best Practices

### Development Workflow

1. **Use simulation tests for rapid development**
   ```bash
   npm run test:llm-simulation
   ```

2. **Use real LLM tests for validation**
   ```bash
   npm run test:real-llm
   ```

3. **Run both before releases**
   ```bash
   npm run test:all
   npm run test:real-llm
   ```

### Model Selection

- **Development**: Use `qwen2.5:0.5b` for fastest iteration
- **Validation**: Use `phi3.5:3.8b` for thorough testing
- **CI/CD**: Consider `qwen2.5:0.5b` if resources allow

### Writing Effective Tests

```typescript
it('should understand complex queries', async () => {
  const result = await llmHarness.askLLM('Help me prioritize my overwhelming workload');

  // Validate tool usage
  expect(result.toolCalls.length).toBeGreaterThan(1);

  // Check reasoning quality
  expect(result.reasoning.some(r =>
    r.includes('overwhelm') || r.includes('prioritize')
  )).toBe(true);

  // Verify expected tools were used
  const toolNames = result.toolCalls.map(c => c.tool);
  expect(toolNames).toContain('tasks');

  // Log for debugging
  console.log('Reasoning:', result.reasoning);
  console.log('Tools used:', toolNames);
});
```

## Troubleshooting

### Ollama Not Available

```bash
# Check if Ollama is running
curl http://localhost:11434/api/version

# Start Ollama if needed
ollama serve
```

### Models Not Downloaded

```bash
# Check available models
ollama list

# Download missing models
npm run setup-real-llm setup
```

### Tests Timing Out

- Use smaller models (`qwen2.5:0.5b`)
- Increase test timeouts in vitest config
- Check system resources (CPU/memory)

### Poor AI Performance

- Verify model is appropriate size
- Check tool descriptions are clear
- Validate test queries are unambiguous
- Consider using larger models for complex tests

## Future Improvements

### Planned Features

1. **Multi-model testing** - Test across different model sizes
2. **Performance benchmarking** - Compare model efficiency
3. **Tool description optimization** - Improve based on AI feedback
4. **Automated failure analysis** - AI-driven test debugging
5. **CI integration** - Optional real LLM tests in CI

### Research Opportunities

1. **Tool description effectiveness** - Which descriptions work best?
2. **Emergent behavior patterns** - What unexpected combinations work?
3. **Model size vs performance** - Optimal model for different tasks
4. **Natural language patterns** - Most effective query structures

## Contributing

When adding real LLM tests:

1. **Focus on realistic scenarios** - Test actual user workflows
2. **Include reasoning validation** - Check AI decision-making process
3. **Use appropriate timeouts** - AI responses take time
4. **Log comprehensively** - Help debug AI behavior
5. **Test with multiple models** - Ensure broad compatibility

## Resources

- **Ollama Documentation**: https://ollama.ai/
- **Model Library**: https://ollama.ai/library
- **MCP Specification**: https://modelcontextprotocol.io/
- **Our Simulation Tests**: `tests/integration/llm-assistant-simulation.test.ts`
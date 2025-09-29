# MCP Programmatic Prompts

This directory contains TypeScript-based prompt classes that are integrated directly into the OmniFocus MCP server. These prompts are available through the MCP protocol and can be called programmatically by Claude or other MCP clients.

**📚 Related Documentation:**
- **[Main README](../../README.md)** - Installation, setup, and overview
- **[Manual Templates](../../prompts/README.md)** - Copy/paste prompts for testing and workflows
- **[API Documentation](../../docs/)** - Tool references and implementation guides
- **[Improvement Roadmap](../../docs/IMPROVEMENT_ROADMAP.md)** - Future enhancements including prompt discovery CLI
- **[Real LLM Testing](../../docs/REAL_LLM_TESTING.md)** - How to test prompts with actual AI models

## Architecture

### Prompt Structure
- **Base Class**: `base.ts` - Abstract base class for all prompts
- **Registration**: `index.ts` - Prompt registration and MCP handlers
- **Categories**: Organized by functionality (GTD workflows, reference materials)

### Available Prompts

#### 🔍 Quick Discovery

**All MCP prompts can be accessed by asking Claude:**
```
"Use the [prompt_name] prompt"
"Show me the [prompt_name] prompt"
"List available prompts"
```

| Prompt Name | Purpose | Usage Example |
|-------------|---------|---------------|
| `gtd_principles` | Learn GTD methodology | "Show me the gtd_principles prompt" |
| `gtd_weekly_review` | Complete weekly review | "Use the gtd_weekly_review prompt" |
| `gtd_process_inbox` | Process inbox items | "Use the gtd_process_inbox prompt" |
| `eisenhower_matrix_inbox` | Prioritize by urgency/importance | "Use the eisenhower_matrix_inbox prompt" |
| `quick_reference` | Essential commands | "Use the quick_reference prompt" |

**🚀 Coming Soon:** `npm run prompts:list` CLI command for prompt discovery

#### GTD Workflow Prompts (`gtd/`)
- **`gtd_principles`** (`GTDPrinciplesPrompt.ts`) - Core GTD methodology and principles guide
- **`gtd_weekly_review`** (`WeeklyReviewPrompt.ts`) - Complete weekly review process with OmniFocus integration
- **`gtd_process_inbox`** (`InboxProcessingPrompt.ts`) - Structured inbox processing workflow
- **`eisenhower_matrix_inbox`** (`eisenhower-matrix.ts`) - Prioritize inbox items using the Eisenhower Matrix

#### Reference Prompts (`reference/`)
- **`quick_reference`** (`QuickReferencePrompt.ts`) - Essential OmniFocus MCP commands and patterns

## Usage

### For Users
These prompts are accessed through natural language with Claude:

```
"Use the gtd_weekly_review prompt to help me with my weekly review"
"Show me the gtd_principles prompt"
"Use the eisenhower_matrix_inbox prompt to prioritize my tasks"
```

### For Developers
To add a new prompt:

1. Create a new TypeScript class extending `BasePrompt`
2. Implement required methods: `name`, `description`, `arguments`, `generateMessages`
3. Register the prompt in `index.ts`
4. Add tests for the prompt functionality

Example:
```typescript
export class MyCustomPrompt extends BasePrompt {
  name = 'my_custom_prompt';
  description = 'Description of what this prompt does';
  arguments = [
    { name: 'context', description: 'Context for the prompt', required: false }
  ];

  generateMessages(args: Record<string, unknown>): PromptMessage[] {
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Your prompt content here...'
        }
      }
    ];
  }
}
```

## 🔗 Manual Template Alternatives

For users who prefer copy/paste templates or need offline access, see the **[Manual Templates Documentation](../../prompts/README.md)** which contains:

- **[Manual Templates](../../prompts/)**: Ready-to-copy Markdown files
- **[Testing Prompts](../../prompts/test-v2-comprehensive.md)**: Comprehensive validation workflows
- **[Daily Use Templates](../../prompts/daily-gtd-workflow.md)**: GTD workflows and productivity patterns
- **[Feature Testing](../../prompts/v2-features-test.md)**: V2-specific functionality validation

### Choosing Between Approaches

| Approach | Best For | Usage |
|----------|----------|-------|
| **[MCP Prompts](.)** (this directory) | Advanced users, integrated workflows | Ask Claude to "use the [prompt_name] prompt" |
| **[Manual Templates](../../prompts/)** (copy/paste) | Beginners, customization, offline use | Copy/paste entire prompt into Claude |

Both approaches:
- Use the same underlying V2 tools
- Provide similar functionality through different interfaces
- Are maintained in parallel for different user needs

## Implementation Details

### MCP Protocol Integration
- Prompts are registered as MCP prompt resources
- Support parameterization through the MCP protocol
- Generate structured `PromptMessage` arrays for conversation flows
- Handle argument validation and default values

### Performance Considerations
- Prompts are loaded once at server startup
- Lightweight generation of message content
- No external dependencies for prompt execution
- Cached prompt metadata for quick listing

## Testing

Prompt functionality is tested through:
- Unit tests for individual prompt classes
- Integration tests through the MCP protocol
- Manual validation with Claude Desktop
- Automated prompt discovery and metadata validation

## Future Enhancements

Potential improvements identified in the **[Improvement Roadmap](../../docs/IMPROVEMENT_ROADMAP.md)**:
- **[Prompt discovery CLI](../../docs/IMPROVEMENT_ROADMAP.md#prompt-discovery-cli-tool)** - List available MCP prompts via command line (`npm run prompts:list`)
- **Template generation** - Auto-generate manual templates from TypeScript prompts
- **Dynamic prompt composition** - Combine multiple prompts for complex scenarios
- **Usage analytics** - Track which prompts are most valuable

**⚙️ Next Up:** The prompt discovery CLI tool is currently planned for implementation to bridge the gap between manual and programmatic approaches.
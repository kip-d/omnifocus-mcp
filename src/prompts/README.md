# MCP Programmatic Prompts

This directory contains TypeScript-based prompt classes that are integrated directly into the OmniFocus MCP server. These prompts are available through the MCP protocol and can be called programmatically by Claude or other MCP clients.

**📚 Related Documentation:**
- **[Main README](../../README.md)** - Installation, setup, and overview
- **[User Prompts Guide](../../prompts/README.md)** - Ready-to-use prompts and workflows
- **[API Documentation](../../docs/)** - Tool references and implementation guides

## Architecture

### Prompt Structure
- **Base Class**: `base.ts` - Abstract base class for all prompts
- **Registration**: `index.ts` - Prompt registration and MCP handlers
- **Categories**: Organized by functionality (GTD workflows, reference materials)

### Available Prompts

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

For users who prefer copy/paste templates or need offline access, see the **[`/prompts/` directory](../../prompts/)** which contains:

- **Manual Templates**: Ready-to-copy Markdown files
- **Testing Prompts**: Comprehensive validation workflows
- **Daily Use Templates**: GTD workflows and productivity patterns

### Choosing Between Approaches

| Approach | Best For | Usage |
|----------|----------|-------|
| **MCP Prompts** (this directory) | Advanced users, integrated workflows | Ask Claude to "use the [prompt_name] prompt" |
| **Manual Templates** (`/prompts/`) | Beginners, customization, offline use | Copy/paste entire prompt into Claude |

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

Potential improvements identified in the roadmap:
- **Prompt discovery CLI** - List available MCP prompts via command line
- **Template generation** - Auto-generate manual templates from TypeScript prompts
- **Dynamic prompt composition** - Combine multiple prompts for complex scenarios
- **Usage analytics** - Track which prompts are most valuable
# Prompt Discovery CLI Tool

The OmniFocus MCP server includes a comprehensive prompt discovery CLI tool that provides unified access to both manual
templates and programmatic MCP prompts.

## Overview

The `npm run prompts:list` command bridges the discovery gap between:

- **Manual Templates** (`/prompts/*.md`) - Copy/paste templates
- **MCP Prompts** (`/src/prompts/*.ts`) - Built-in programmatic prompts

## Quick Start

```bash
# List all available prompts
npm run prompts:list

# Show only MCP prompts with examples
npm run prompts:list -- --type=mcp --examples

# Export all prompts as JSON
npm run prompts:list -- --format=json

# Validate prompt system integrity
npm run prompts:list -- --validate
```

## Command Reference

### Basic Usage

```bash
npm run prompts:list [options]
```

### Options

| Option       | Values                              | Description                            |
| ------------ | ----------------------------------- | -------------------------------------- |
| `--type`     | `all`, `mcp`, `template`            | Filter by prompt type (default: `all`) |
| `--category` | Any string                          | Filter by category (case-insensitive)  |
| `--format`   | `table`, `json`, `markdown`, `list` | Output format (default: `table`)       |
| `--examples` | Flag                                | Include usage examples in output       |
| `--validate` | Flag                                | Validate all prompts and exit          |
| `--help`     | Flag                                | Show help message                      |

### Output Formats

#### Table Format (Default)

```bash
npm run prompts:list
```

```
Name              | Type | Category      | Description
------------------+------+---------------+---------------------
gtd_principles    | mcp  | GTD Workflows | Core GTD (Getting Things Done) principles...
Daily GTD Workflow| template | GTD Workflows | Use this prompt for your daily Getting Things Done...

Total: 8 prompts (5 MCP + 3 templates)
```

#### JSON Format

```bash
npm run prompts:list -- --format=json
```

```json
[
  {
    "name": "gtd_principles",
    "description": "Core GTD (Getting Things Done) principles...",
    "type": "mcp",
    "category": "GTD Workflows",
    "file": "./src/prompts/gtd/GTDPrinciplesPrompt.ts",
    "arguments": [],
    "usageExample": "Ask Claude: \"Use the gtd_principles prompt\""
  }
]
```

#### Markdown Format

```bash
npm run prompts:list -- --format=markdown
```

Generates a complete markdown documentation of all prompts organized by category.

#### List Format

```bash
npm run prompts:list -- --format=list
```

```
gtd_principles (mcp)
Daily GTD Workflow (template)
```

## Use Cases

### Development Workflow

```bash
# Quick overview during development
npm run prompts:list

# Check what GTD prompts are available
npm run prompts:list -- --category=gtd

# Get usage examples for integration
npm run prompts:list -- --examples
```

### CI/CD Integration

```bash
# Validate prompt system in CI
npm run prompts:list -- --validate

# Generate prompt documentation
npm run prompts:list -- --format=markdown > docs/PROMPTS_GENERATED.md

# Export prompt metadata for other tools
npm run prompts:list -- --format=json > prompts-metadata.json
```

### Documentation Generation

```bash
# Generate comprehensive prompt guide
npm run prompts:list -- --format=markdown --examples > PROMPT_GUIDE.md

# Create quick reference card
npm run prompts:list -- --type=mcp --format=list
```

## Prompt Categories

The discovery tool automatically categorizes prompts:

### GTD Workflows

- **MCP Prompts**: `gtd_principles`, `gtd_weekly_review`, `gtd_process_inbox`, `eisenhower_matrix_inbox`
- **Templates**: `daily-gtd-workflow.md`

### Testing

- **Templates**: `test-v2-comprehensive.md`, `v2-features-test.md`

### Reference

- **MCP Prompts**: `quick_reference`

## Discovery Process

### Manual Templates Discovery

1. Scans `/prompts/*.md` files (excluding README.md)
2. Extracts title from first `#` heading
3. Extracts description from first paragraph
4. Determines category based on filename patterns
5. Calculates file size for reference

### MCP Prompts Discovery

1. Reads `/src/prompts/index.ts` for registered prompt classes
2. Locates corresponding TypeScript files
3. Parses class metadata using regex patterns
4. Extracts `name`, `description`, and file paths
5. Maps files to appropriate categories

## Validation Features

```bash
npm run prompts:list -- --validate
```

The validation mode:

- ✅ Verifies all discovered files exist
- ✅ Checks MCP prompt class files are accessible
- ✅ Validates manual template files are readable
- ✅ Reports any broken references or missing files
- ✅ Returns appropriate exit codes for CI/CD

**Exit Codes:**

- `0` - All prompts validated successfully
- `1` - Validation errors found

## Integration Examples

### Generate Documentation

```bash
#!/bin/bash
# Generate complete prompt documentation
echo "# OmniFocus MCP Prompts" > PROMPTS.md
echo "" >> PROMPTS.md
npm run prompts:list -- --format=markdown --examples >> PROMPTS.md
```

### CI/CD Health Check

```bash
#!/bin/bash
# Validate prompt system in CI
if npm run prompts:list -- --validate; then
  echo "✅ Prompt system healthy"
else
  echo "❌ Prompt system validation failed"
  exit 1
fi
```

### Export for External Tools

```bash
# Export prompt metadata for other tools
npm run prompts:list -- --format=json > prompts.json

# Use in other scripts
PROMPT_COUNT=$(npm run prompts:list -- --format=json | jq length)
echo "Total prompts available: $PROMPT_COUNT"
```

## Architecture

### File Structure

```
scripts/
├── list-prompts.ts         # Main CLI implementation
│
prompts/                    # Manual templates
├── *.md                    # Template files
│
src/prompts/               # MCP prompts
├── index.ts               # Prompt registration
├── gtd/                   # GTD workflow prompts
└── reference/             # Reference prompts
```

### Implementation Details

The CLI tool is implemented as a TypeScript module with:

- **Zero dependencies** - Uses only Node.js built-ins
- **Fast discovery** - Concurrent scanning of both prompt types
- **Robust parsing** - Handles various file formats and edge cases
- **Flexible output** - Multiple formats for different use cases
- **Validation support** - Comprehensive integrity checking

## Troubleshooting

### Common Issues

**"Warning: Could not find file for XyzPrompt"**

- The prompt class exists in `index.ts` but the file mapping needs updating
- Add the class to the `classFileMap` in `list-prompts.ts`

**"Warning: Could not parse metadata for XyzPrompt"**

- The TypeScript file doesn't have the expected `name =` and `description =` patterns
- Check the prompt class follows the standard format

**Validation failures**

- Check that all referenced files exist and are accessible
- Verify TypeScript compilation succeeds for MCP prompts
- Ensure manual template files are valid Markdown

### Debug Mode

For detailed debugging, modify the CLI to add verbose logging:

```bash
# Add DEBUG environment variable support
DEBUG=prompts npm run prompts:list
```

## Contributing

### Adding New Prompts

When adding new prompts, the CLI will automatically discover them if they follow the patterns:

**For MCP Prompts:**

1. Create the TypeScript class in appropriate subdirectory
2. Register it in `/src/prompts/index.ts`
3. Use standard `name =` and `description =` patterns

**For Manual Templates:**

1. Add `.md` file to `/prompts/` directory
2. Start with `# Title` heading
3. Follow with description paragraph

### Extending the CLI

The CLI is designed for extension:

- **New output formats**: Add cases to `formatOutput()` method
- **Additional filters**: Extend the `DiscoveryOptions` interface
- **Enhanced parsing**: Improve regex patterns in parsing methods
- **New categories**: Update category detection logic

## Future Enhancements

Planned improvements for the prompt discovery CLI:

- **Argument parsing** - Extract and display prompt arguments
- **Template generation** - Auto-generate manual templates from MCP prompts
- **Usage analytics** - Track which prompts are most frequently used
- **Interactive mode** - Browse and select prompts interactively
- **Integration testing** - Test prompt execution in addition to discovery

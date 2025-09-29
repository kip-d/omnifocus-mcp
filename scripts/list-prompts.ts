#!/usr/bin/env node
/**
 * Prompt Discovery CLI Tool
 * Lists and discovers all available prompts (both manual templates and MCP prompts)
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

interface MCPPromptInfo {
  name: string;
  description: string;
  type: 'mcp';
  category: string;
  file: string;
  arguments: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  usageExample: string;
}

interface ManualTemplateInfo {
  name: string;
  description: string;
  type: 'template';
  category: string;
  file: string;
  size: string;
  usageExample: string;
}

type PromptInfo = MCPPromptInfo | ManualTemplateInfo;

interface DiscoveryOptions {
  type?: 'all' | 'mcp' | 'template';
  category?: string;
  format?: 'table' | 'json' | 'markdown' | 'list';
  examples?: boolean;
  validate?: boolean;
}

class PromptDiscovery {
  private mcpPrompts: MCPPromptInfo[] = [];
  private manualTemplates: ManualTemplateInfo[] = [];

  async discover(): Promise<void> {
    await Promise.all([
      this.discoverMCPPrompts(),
      this.discoverManualTemplates()
    ]);
  }

  private async discoverMCPPrompts(): Promise<void> {
    const promptsDir = join(PROJECT_ROOT, 'src', 'prompts');

    try {
      // Read the prompts index to get registered prompts
      const indexPath = join(promptsDir, 'index.ts');
      const indexContent = await readFile(indexPath, 'utf-8');

      // Parse registered prompt instances from index.ts
      const promptMatches = indexContent.match(/new (\w+Prompt)\(\)/g) || [];

      // Use Set to avoid duplicates
      const uniqueClasses = new Set<string>();
      for (const match of promptMatches) {
        const className = match.replace('new ', '').replace('()', '');
        uniqueClasses.add(className);
      }

      for (const className of uniqueClasses) {
        await this.parsePromptClass(className, promptsDir);
      }
    } catch (error) {
      console.warn(`Warning: Could not read MCP prompts: ${error}`);
    }
  }

  private async parsePromptClass(className: string, promptsDir: string): Promise<void> {
    try {
      // Map specific class names to known files
      const classFileMap: Record<string, string> = {
        'GTDPrinciplesPrompt': 'gtd/GTDPrinciplesPrompt.ts',
        'WeeklyReviewPrompt': 'gtd/WeeklyReviewPrompt.ts',
        'InboxProcessingPrompt': 'gtd/InboxProcessingPrompt.ts',
        'EisenhowerMatrixPrompt': 'gtd/eisenhower-matrix.ts',
        'QuickReferencePrompt': 'reference/QuickReferencePrompt.ts',
      };

      // Find the file containing this class
      const possiblePaths = [
        classFileMap[className] ? join(promptsDir, classFileMap[className]) : null,
        join(promptsDir, 'gtd', `${className}.ts`),
        join(promptsDir, 'reference', `${className}.ts`),
      ].filter(Boolean) as string[];

      let filePath: string | null = null;
      for (const path of possiblePaths) {
        try {
          await stat(path);
          filePath = path;
          break;
        } catch { /* File doesn't exist, continue */ }
      }

      if (!filePath) {
        console.warn(`Warning: Could not find file for ${className}`);
        return;
      }

      const content = await readFile(filePath, 'utf-8');

      // Extract prompt metadata using regex
      const nameMatch = content.match(/name\s*=\s*['"`]([^'"`]+)['"`]/);
      const descriptionMatch = content.match(/description\s*=\s*['"`]([^'"`]+)['"`]/);

      if (!nameMatch || !descriptionMatch) {
        console.warn(`Warning: Could not parse metadata for ${className}`);
        return;
      }

      const category = filePath.includes('/gtd/') ? 'GTD Workflows' : 'Reference';

      this.mcpPrompts.push({
        name: nameMatch[1],
        description: descriptionMatch[1],
        type: 'mcp',
        category,
        file: filePath.replace(PROJECT_ROOT, '.'),
        arguments: [], // Could be enhanced to parse arguments
        usageExample: `Ask Claude: "Use the ${nameMatch[1]} prompt"`
      });
    } catch (error) {
      console.warn(`Warning: Could not parse ${className}: ${error}`);
    }
  }

  private async discoverManualTemplates(): Promise<void> {
    const templatesDir = join(PROJECT_ROOT, 'prompts');

    try {
      const files = await readdir(templatesDir);
      const mdFiles = files.filter(file => file.endsWith('.md') && file !== 'README.md');

      for (const file of mdFiles) {
        await this.parseManualTemplate(join(templatesDir, file));
      }
    } catch (error) {
      console.warn(`Warning: Could not read manual templates: ${error}`);
    }
  }

  private async parseManualTemplate(filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const stats = await stat(filePath);

      // Extract title from first # heading
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : filePath.split('/').pop()?.replace('.md', '') || 'Unknown';

      // Extract description from content after title
      const descriptionMatch = content.match(/^#[^#\n]*\n\n([^#\n]+)/m);
      const description = descriptionMatch ? descriptionMatch[1].trim() : 'Manual template prompt';

      // Determine category based on filename
      let category = 'General';
      if (filePath.includes('test')) category = 'Testing';
      if (filePath.includes('gtd') || filePath.includes('daily')) category = 'GTD Workflows';
      if (filePath.includes('v2-features')) category = 'Testing';

      const fileName = filePath.split('/').pop() || '';
      const sizeKB = Math.round(stats.size / 1024);

      this.manualTemplates.push({
        name: title,
        description,
        type: 'template',
        category,
        file: `./prompts/${fileName}`,
        size: `${sizeKB}KB`,
        usageExample: `Copy content from ${fileName} and paste into Claude`
      });
    } catch (error) {
      console.warn(`Warning: Could not parse ${filePath}: ${error}`);
    }
  }

  getAllPrompts(): PromptInfo[] {
    return [...this.mcpPrompts, ...this.manualTemplates];
  }

  getFilteredPrompts(options: DiscoveryOptions): PromptInfo[] {
    let prompts = this.getAllPrompts();

    if (options.type && options.type !== 'all') {
      prompts = prompts.filter(p => p.type === options.type);
    }

    if (options.category) {
      prompts = prompts.filter(p =>
        p.category.toLowerCase().includes(options.category!.toLowerCase())
      );
    }

    return prompts.sort((a, b) => a.name.localeCompare(b.name));
  }

  formatOutput(prompts: PromptInfo[], options: DiscoveryOptions): string {
    switch (options.format) {
      case 'json':
        return JSON.stringify(prompts, null, 2);

      case 'markdown':
        return this.formatMarkdown(prompts, options);

      case 'list':
        return prompts.map(p => `${p.name} (${p.type})`).join('\n');

      default:
        return this.formatTable(prompts, options);
    }
  }

  private formatTable(prompts: PromptInfo[], options: DiscoveryOptions): string {
    if (prompts.length === 0) {
      return 'No prompts found matching criteria.';
    }

    const maxNameLen = Math.max(4, ...prompts.map(p => p.name.length));
    const maxTypeLen = Math.max(4, ...prompts.map(p => p.type.length));
    const maxCategoryLen = Math.max(8, ...prompts.map(p => p.category.length));

    let output = '';
    output += `${'Name'.padEnd(maxNameLen)} | ${'Type'.padEnd(maxTypeLen)} | ${'Category'.padEnd(maxCategoryLen)} | Description\n`;
    output += `${'-'.repeat(maxNameLen)}-+-${'-'.repeat(maxTypeLen)}-+-${'-'.repeat(maxCategoryLen)}-+-${'-'.repeat(20)}\n`;

    for (const prompt of prompts) {
      const shortDesc = prompt.description.length > 60
        ? prompt.description.substring(0, 57) + '...'
        : prompt.description;

      output += `${prompt.name.padEnd(maxNameLen)} | ${prompt.type.padEnd(maxTypeLen)} | ${prompt.category.padEnd(maxCategoryLen)} | ${shortDesc}\n`;
    }

    if (options.examples) {
      output += '\n\nUsage Examples:\n';
      for (const prompt of prompts.slice(0, 5)) { // Show first 5 examples
        output += `  ${prompt.name}: ${prompt.usageExample}\n`;
      }
    }

    return output;
  }

  private formatMarkdown(prompts: PromptInfo[], options: DiscoveryOptions): string {
    let output = '# Available Prompts\n\n';

    const categories = [...new Set(prompts.map(p => p.category))];

    for (const category of categories.sort()) {
      const categoryPrompts = prompts.filter(p => p.category === category);
      output += `## ${category}\n\n`;

      for (const prompt of categoryPrompts) {
        output += `### ${prompt.name}\n`;
        output += `**Type:** ${prompt.type}\n\n`;
        output += `${prompt.description}\n\n`;

        if (options.examples) {
          output += `**Usage:** ${prompt.usageExample}\n\n`;
        }

        output += `**File:** \`${prompt.file}\`\n\n`;
        output += '---\n\n';
      }
    }

    return output;
  }

  async validate(): Promise<boolean> {
    let isValid = true;

    // Validate MCP prompts can be imported
    for (const prompt of this.mcpPrompts) {
      try {
        // Basic validation - file exists and has required properties
        const fullPath = join(PROJECT_ROOT, prompt.file.replace('./', ''));
        await stat(fullPath);
      } catch (error) {
        console.error(`❌ MCP Prompt validation failed: ${prompt.name} - ${error}`);
        isValid = false;
      }
    }

    // Validate manual templates
    for (const template of this.manualTemplates) {
      try {
        const fullPath = join(PROJECT_ROOT, template.file.replace('./', ''));
        await stat(fullPath);
      } catch (error) {
        console.error(`❌ Template validation failed: ${template.name} - ${error}`);
        isValid = false;
      }
    }

    if (isValid) {
      console.log(`✅ All prompts validated successfully (${this.mcpPrompts.length} MCP + ${this.manualTemplates.length} templates)`);
    }

    return isValid;
  }
}

function printUsage(): void {
  console.log(`
Usage: npm run prompts:list [options]

Options:
  --type=<all|mcp|template>     Filter by prompt type (default: all)
  --category=<category>         Filter by category (case-insensitive)
  --format=<table|json|markdown|list>  Output format (default: table)
  --examples                    Include usage examples
  --validate                    Validate all prompts and exit
  --help                        Show this help message

Examples:
  npm run prompts:list                          # List all prompts in table format
  npm run prompts:list -- --type=mcp           # Only MCP prompts
  npm run prompts:list -- --category=gtd       # Only GTD-related prompts
  npm run prompts:list -- --format=json        # JSON output
  npm run prompts:list -- --examples           # Include usage examples
  npm run prompts:list -- --validate           # Validate prompt system
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    printUsage();
    return;
  }

  const options: DiscoveryOptions = {
    type: 'all',
    format: 'table',
    examples: false,
    validate: false
  };

  // Parse command line arguments
  for (const arg of args) {
    if (arg.startsWith('--type=')) {
      const type = arg.split('=')[1] as DiscoveryOptions['type'];
      if (['all', 'mcp', 'template'].includes(type!)) {
        options.type = type;
      } else {
        console.error(`Invalid type: ${type}. Use: all, mcp, or template`);
        process.exit(1);
      }
    } else if (arg.startsWith('--category=')) {
      options.category = arg.split('=')[1];
    } else if (arg.startsWith('--format=')) {
      const format = arg.split('=')[1] as DiscoveryOptions['format'];
      if (['table', 'json', 'markdown', 'list'].includes(format!)) {
        options.format = format;
      } else {
        console.error(`Invalid format: ${format}. Use: table, json, markdown, or list`);
        process.exit(1);
      }
    } else if (arg === '--examples') {
      options.examples = true;
    } else if (arg === '--validate') {
      options.validate = true;
    } else if (!arg.startsWith('--')) {
      console.error(`Unknown argument: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }

  try {
    const discovery = new PromptDiscovery();
    await discovery.discover();

    if (options.validate) {
      const isValid = await discovery.validate();
      process.exit(isValid ? 0 : 1);
    }

    const prompts = discovery.getFilteredPrompts(options);
    const output = discovery.formatOutput(prompts, options);

    console.log(output);

    // Summary line
    if (options.format === 'table') {
      const mcpCount = prompts.filter(p => p.type === 'mcp').length;
      const templateCount = prompts.filter(p => p.type === 'template').length;
      console.log(`\nTotal: ${prompts.length} prompts (${mcpCount} MCP + ${templateCount} templates)`);
    }

  } catch (error) {
    console.error(`Error discovering prompts: ${error}`);
    process.exit(1);
  }
}

// Run the CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
#!/usr/bin/env node

/**
 * Measure MCP tool definition sizes to understand context usage
 */

import { CacheManager } from './dist/cache/CacheManager.js';

// Import all tools
import { QueryTasksToolV2 } from './dist/tools/tasks/QueryTasksToolV2.js';
import { ManageTaskTool } from './dist/tools/tasks/ManageTaskTool.js';
import { BatchCreateTool } from './dist/tools/batch/BatchCreateTool.js';
import { ParseMeetingNotesTool } from './dist/tools/capture/ParseMeetingNotesTool.js';
import { ProjectsToolV2 } from './dist/tools/projects/ProjectsToolV2.js';
import { FoldersTool } from './dist/tools/folders/FoldersTool.js';
import { TagsToolV2 } from './dist/tools/tags/TagsToolV2.js';
import { ExportTool } from './dist/tools/export/ExportTool.js';
import { RecurringTasksTool } from './dist/tools/recurring/RecurringTasksTool.js';
import { ProductivityStatsToolV2 } from './dist/tools/analytics/ProductivityStatsToolV2.js';
import { TaskVelocityToolV2 } from './dist/tools/analytics/TaskVelocityToolV2.js';
import { OverdueAnalysisToolV2 } from './dist/tools/analytics/OverdueAnalysisToolV2.js';
import { WorkflowAnalysisTool } from './dist/tools/analytics/WorkflowAnalysisTool.js';
import { PatternAnalysisToolV2 } from './dist/tools/analytics/PatternAnalysisToolV2.js';
import { ManageReviewsTool } from './dist/tools/reviews/ManageReviewsTool.js';
import { PerspectivesToolV2 } from './dist/tools/perspectives/PerspectivesToolV2.js';
import { SystemToolV2 } from './dist/tools/system/SystemToolV2.js';

async function measureToolSizes() {
  console.log('# MCP Tool Size Analysis\n');
  console.log('Measuring actual tool definitions as sent to LLM...\n');

  // Create dummy cache manager
  const cache = new CacheManager();

  // Instantiate all tools
  const tools = [
    new QueryTasksToolV2(cache),
    new ManageTaskTool(cache),
    new BatchCreateTool(cache),
    new ParseMeetingNotesTool(cache),
    new ProjectsToolV2(cache),
    new FoldersTool(cache),
    new TagsToolV2(cache),
    new ExportTool(cache),
    new RecurringTasksTool(cache),
    new ProductivityStatsToolV2(cache),
    new TaskVelocityToolV2(cache),
    new OverdueAnalysisToolV2(cache),
    new WorkflowAnalysisTool(cache),
    new PatternAnalysisToolV2(cache),
    new ManageReviewsTool(cache),
    new PerspectivesToolV2(cache),
    new SystemToolV2(cache),
  ];

  const toolSizes = [];
  let totalSize = 0;

  for (const tool of tools) {
    // Serialize tool definition as it would be sent via MCP
    const toolDef = JSON.stringify(
      {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      null,
      2,
    );

    const sizeBytes = Buffer.byteLength(toolDef, 'utf8');
    const sizeChars = toolDef.length;

    // Rough token estimate (1 token ≈ 4 characters for English)
    const estimatedTokens = Math.ceil(sizeChars / 4);

    toolSizes.push({
      name: tool.name,
      sizeBytes,
      sizeChars,
      estimatedTokens,
      descriptionLines: tool.description.split('\n').length,
    });

    totalSize += sizeChars;
  }

  // Sort by size descending
  toolSizes.sort((a, b) => b.sizeChars - a.sizeChars);

  // Print results
  console.log('## Individual Tool Sizes\n');
  console.log('| Tool Name | Characters | Est. Tokens | Desc Lines | % of Total |');
  console.log('|-----------|------------|-------------|------------|------------|');

  for (const tool of toolSizes) {
    const percentage = ((tool.sizeChars / totalSize) * 100).toFixed(1);
    console.log(
      `| ${tool.name.padEnd(30)} | ${String(tool.sizeChars).padStart(10)} | ${String(tool.estimatedTokens).padStart(11)} | ${String(tool.descriptionLines).padStart(10)} | ${percentage.padStart(9)}% |`,
    );
  }

  console.log('\n## Summary Statistics\n');
  console.log(`Total tools: ${toolSizes.length}`);
  console.log(`Total characters: ${totalSize.toLocaleString()}`);
  console.log(`Estimated tokens: ${Math.ceil(totalSize / 4).toLocaleString()} (assuming ~4 chars/token)`);
  console.log(`Average per tool: ${Math.round(totalSize / toolSizes.length).toLocaleString()} characters`);

  // Categorize tools
  console.log('\n## Tool Categorization (for 3-tool redesign)\n');

  const readTools = toolSizes.filter(
    (t) =>
      t.name === 'tasks' ||
      t.name === 'projects' ||
      t.name === 'tags' ||
      t.name === 'perspectives' ||
      t.name === 'folders' ||
      t.name === 'export' ||
      t.name === 'recurring_tasks',
  );

  const writeTools = toolSizes.filter((t) => t.name === 'manage_task' || t.name === 'batch_create');

  const analyzeTools = toolSizes.filter(
    (t) =>
      t.name === 'productivity_stats' ||
      t.name === 'task_velocity' ||
      t.name === 'analyze_overdue' ||
      t.name === 'pattern_analysis' ||
      t.name === 'workflow_analysis' ||
      t.name === 'parse_meeting_notes' ||
      t.name === 'manage_reviews',
  );

  const otherTools = toolSizes.filter((t) => t.name === 'system');

  const readSize = readTools.reduce((sum, t) => sum + t.sizeChars, 0);
  const writeSize = writeTools.reduce((sum, t) => sum + t.sizeChars, 0);
  const analyzeSize = analyzeTools.reduce((sum, t) => sum + t.sizeChars, 0);
  const otherSize = otherTools.reduce((sum, t) => sum + t.sizeChars, 0);

  console.log(`### Read Operations (${readTools.length} tools → consolidate into 1 tool)`);
  console.log(`- Current tools: ${readTools.map((t) => t.name).join(', ')}`);
  console.log(
    `- Current total size: ${readSize.toLocaleString()} chars (~${Math.ceil(readSize / 4).toLocaleString()} tokens)`,
  );
  console.log(`- Avg per tool: ${Math.round(readSize / readTools.length).toLocaleString()} chars`);

  console.log(`\n### Write Operations (${writeTools.length} tools → consolidate into 1 tool)`);
  console.log(`- Current tools: ${writeTools.map((t) => t.name).join(', ')}`);
  console.log(
    `- Current total size: ${writeSize.toLocaleString()} chars (~${Math.ceil(writeSize / 4).toLocaleString()} tokens)`,
  );
  console.log(`- Avg per tool: ${Math.round(writeSize / writeTools.length).toLocaleString()} chars`);

  console.log(`\n### Analyze/Specialized (${analyzeTools.length} tools → consolidate into 1 tool)`);
  console.log(`- Current tools: ${analyzeTools.map((t) => t.name).join(', ')}`);
  console.log(
    `- Current total size: ${analyzeSize.toLocaleString()} chars (~${Math.ceil(analyzeSize / 4).toLocaleString()} tokens)`,
  );
  console.log(`- Avg per tool: ${Math.round(analyzeSize / analyzeTools.length).toLocaleString()} chars`);

  console.log(`\n### System (${otherTools.length} tool → keep separate)`);
  console.log(`- Current tools: ${otherTools.map((t) => t.name).join(', ')}`);
  console.log(
    `- Current total size: ${otherSize.toLocaleString()} chars (~${Math.ceil(otherSize / 4).toLocaleString()} tokens)`,
  );

  console.log('\n## Consolidation Impact Estimate\n');
  console.log(`**Current state:** 17 tools consuming ~${Math.ceil(totalSize / 4).toLocaleString()} tokens`);
  console.log(`**Proposed state:** 3-4 tools (read, write, analyze, system)`);
  console.log('\n### Best Case Scenario (aggressive deduplication):');
  console.log(`- Single "read" tool with unified schema: ~3,000-5,000 chars`);
  console.log(`- Single "write" tool with unified schema: ~3,000-5,000 chars`);
  console.log(`- Single "analyze" tool with all operations: ~8,000-12,000 chars`);
  console.log(`- Keep "system" tool as-is: ~${otherSize.toLocaleString()} chars`);
  console.log(`- **Estimated total: ~15,000-23,000 chars (~3,750-5,750 tokens)**`);
  console.log(`- **Potential savings: ${((1 - 20000 / totalSize) * 100).toFixed(0)}% reduction**`);

  console.log('\n### Realistic Scenario (some documentation overlap):');
  console.log(`- Each consolidated tool needs comprehensive docs`);
  console.log(`- Complex operation discriminators add schema complexity`);
  console.log(`- **Estimated total: ~25,000-35,000 chars (~6,250-8,750 tokens)**`);
  console.log(`- **Potential savings: ${((1 - 30000 / totalSize) * 100).toFixed(0)}% reduction**`);

  console.log('\n### Worst Case (increased complexity):');
  console.log(`- Complex schemas harder for LLMs to parse`);
  console.log(`- More examples needed per tool`);
  console.log(`- **Estimated total: ~40,000-50,000 chars (~10,000-12,500 tokens)**`);
  console.log(`- **Potential savings: ${((1 - 45000 / totalSize) * 100).toFixed(0)}% reduction**`);

  console.log('\n### Recommendations:\n');
  console.log('1. **Measure real-world usage:** Which tools are actually called frequently?');
  console.log('2. **Optimize high-frequency tools:** Keep read/write simple for common operations');
  console.log('3. **Accept complexity in low-frequency tools:** Analyze tool can be complex since rarely used');
  console.log('4. **Consider hybrid approach:** Consolidate where it makes sense, keep specialized where it helps');
  console.log('5. **Focus on description quality:** Clear, concise docs matter more than tool count');
}

measureToolSizes().catch(console.error);

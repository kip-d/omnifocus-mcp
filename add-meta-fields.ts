#!/usr/bin/env node
/**
 * Script to add meta fields to all 17 tools efficiently
 * Run with: npx ts-node add-meta-fields.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Meta fields for all 17 tools - organized by category
const toolsMeta: Record<string, { content: string; after: string }> = {
  // Task Management (3 tools)
  'src/tools/tasks/ManageTaskTool.ts': {
    content: `\n  meta = {
    category: 'Task Management' as const,
    stability: 'stable' as const,
    complexity: 'moderate' as const,
    performanceClass: 'fast' as const,
    tags: ['mutations', 'write', 'create', 'update', 'complete', 'delete'],
    capabilities: ['create', 'update', 'complete', 'delete', 'batch'],
  };`,
    after: 'schema = ManageTaskToolSchemaV2;',
  },
  'src/tools/batch/BatchCreateTool.ts': {
    content: `\n  meta = {
    category: 'Task Management' as const,
    stability: 'stable' as const,
    complexity: 'moderate' as const,
    performanceClass: 'moderate' as const,
    tags: ['mutations', 'write', 'batch', 'create', 'hierarchy'],
    capabilities: ['batch-create', 'hierarchy', 'projects', 'tasks'],
  };`,
    after: 'schema = BatchCreateToolSchemaV2;',
  },

  // Organization (3 tools)
  'src/tools/projects/ProjectsToolV2.ts': {
    content: `\n  meta = {
    category: 'Organization' as const,
    stability: 'stable' as const,
    complexity: 'moderate' as const,
    performanceClass: 'fast' as const,
    tags: ['queries', 'mutations', 'organization', 'management'],
    capabilities: ['list', 'create', 'update', 'complete', 'delete', 'stats'],
  };`,
    after: 'schema = ProjectsToolSchemaV2;',
  },
  'src/tools/folders/FoldersTool.ts': {
    content: `\n  meta = {
    category: 'Organization' as const,
    stability: 'stable' as const,
    complexity: 'simple' as const,
    performanceClass: 'fast' as const,
    tags: ['queries', 'mutations', 'hierarchy', 'organization'],
    capabilities: ['list', 'create', 'update', 'delete', 'move'],
  };`,
    after: 'schema = FoldersToolSchemaV2;',
  },
  'src/tools/tags/TagsToolV2.ts': {
    content: `\n  meta = {
    category: 'Organization' as const,
    stability: 'stable' as const,
    complexity: 'simple' as const,
    performanceClass: 'fast' as const,
    tags: ['queries', 'mutations', 'hierarchy', 'metadata'],
    capabilities: ['list', 'create', 'delete', 'manage', 'hierarchy'],
  };`,
    after: 'schema = TagsToolSchemaV2;',
  },

  // Analytics (5 tools)
  'src/tools/analytics/ProductivityStatsToolV2.ts': {
    content: `\n  meta = {
    category: 'Analytics' as const,
    stability: 'stable' as const,
    complexity: 'complex' as const,
    performanceClass: 'slow' as const,
    tags: ['analytics', 'read-only', 'metrics', 'health'],
    capabilities: ['health-metrics', 'completion-rate', 'trends', 'statistics'],
  };`,
    after: 'schema = ProductivityStatsSchemaV2;',
  },
  'src/tools/analytics/TaskVelocityToolV2.ts': {
    content: `\n  meta = {
    category: 'Analytics' as const,
    stability: 'stable' as const,
    complexity: 'complex' as const,
    performanceClass: 'moderate' as const,
    tags: ['analytics', 'read-only', 'trends', 'velocity'],
    capabilities: ['completion-trends', 'velocity-metrics', 'forecast'],
  };`,
    after: 'schema = TaskVelocitySchemaV2;',
  },
  'src/tools/analytics/OverdueAnalysisToolV2.ts': {
    content: `\n  meta = {
    category: 'Analytics' as const,
    stability: 'stable' as const,
    complexity: 'moderate' as const,
    performanceClass: 'moderate' as const,
    tags: ['analytics', 'read-only', 'bottlenecks', 'overdue'],
    capabilities: ['bottleneck-analysis', 'pattern-detection', 'grouping'],
  };`,
    after: 'schema = OverdueAnalysisSchemaV2;',
  },
  'src/tools/analytics/WorkflowAnalysisTool.ts': {
    content: `\n  meta = {
    category: 'Analytics' as const,
    stability: 'stable' as const,
    complexity: 'complex' as const,
    performanceClass: 'slow' as const,
    tags: ['analytics', 'read-only', 'workflow', 'insights'],
    capabilities: ['workflow-analysis', 'pattern-recognition', 'insights'],
  };`,
    after: 'schema = WorkflowAnalysisSchemaV2;',
  },
  'src/tools/analytics/PatternAnalysisToolV2.ts': {
    content: `\n  meta = {
    category: 'Analytics' as const,
    stability: 'stable' as const,
    complexity: 'complex' as const,
    performanceClass: 'moderate' as const,
    tags: ['analytics', 'read-only', 'patterns', 'detection'],
    capabilities: ['pattern-detection', 'anomalies', 'database-wide-analysis'],
  };`,
    after: 'schema = PatternAnalysisSchemaV2;',
  },

  // Utilities (6 tools)
  'src/tools/export/ExportTool.ts': {
    content: `\n  meta = {
    category: 'Utility' as const,
    stability: 'stable' as const,
    complexity: 'moderate' as const,
    performanceClass: 'fast' as const,
    tags: ['queries', 'read-only', 'export', 'data'],
    capabilities: ['export-json', 'export-csv', 'export-markdown', 'filtering'],
  };`,
    after: 'schema = ExportToolSchemaV2;',
  },
  'src/tools/recurring/RecurringTasksTool.ts': {
    content: `\n  meta = {
    category: 'Utility' as const,
    stability: 'stable' as const,
    complexity: 'simple' as const,
    performanceClass: 'fast' as const,
    tags: ['queries', 'read-only', 'recurring', 'analysis'],
    capabilities: ['list-recurring', 'analyze-patterns', 'frequency-stats'],
  };`,
    after: 'schema = RecurringTasksToolSchemaV2;',
  },
  'src/tools/perspectives/PerspectivesToolV2.ts': {
    content: `\n  meta = {
    category: 'Utility' as const,
    stability: 'stable' as const,
    complexity: 'moderate' as const,
    performanceClass: 'fast' as const,
    tags: ['queries', 'read-only', 'perspectives', 'views'],
    capabilities: ['list', 'query', 'formatting', 'grouping'],
  };`,
    after: 'schema = PerspectivesToolSchemaV2;',
  },
  'src/tools/reviews/ManageReviewsTool.ts': {
    content: `\n  meta = {
    category: 'Utility' as const,
    stability: 'stable' as const,
    complexity: 'simple' as const,
    performanceClass: 'fast' as const,
    tags: ['mutations', 'write', 'reviews', 'scheduling'],
    capabilities: ['mark-reviewed', 'list-for-review', 'schedule-review'],
  };`,
    after: 'schema = ManageReviewsToolSchemaV2;',
  },
  'src/tools/capture/ParseMeetingNotesTool.ts': {
    content: `\n  meta = {
    category: 'Capture' as const,
    stability: 'stable' as const,
    complexity: 'moderate' as const,
    performanceClass: 'fast' as const,
    tags: ['mutations', 'write', 'capture', 'parsing', 'ai-powered'],
    capabilities: ['parse-text', 'extract-actions', 'smart-capture'],
  };`,
    after: 'schema = ParseMeetingNotesSchemaV2;',
  },
  'src/tools/system/SystemToolV2.ts': {
    content: `\n  meta = {
    category: 'Utility' as const,
    stability: 'stable' as const,
    complexity: 'simple' as const,
    performanceClass: 'fast' as const,
    tags: ['queries', 'read-only', 'diagnostics', 'system'],
    capabilities: ['version', 'diagnostics', 'metrics', 'health-check'],
  };`,
    after: 'schema = SystemToolSchemaV2;',
  },
};

// Apply meta fields to all tools
let processedCount = 0;
for (const [filePath, { content, after }] of Object.entries(toolsMeta)) {
  const fullPath = join(process.cwd(), filePath);
  try {
    let fileContent = readFileSync(fullPath, 'utf-8');

    // Check if already has meta
    if (fileContent.includes('meta = {')) {
      console.log(`⏭️  Skipped ${filePath} - already has meta fields`);
      continue;
    }

    // Find the schema line and add meta after it
    if (fileContent.includes(after)) {
      fileContent = fileContent.replace(after, `${after}${content}`);
      writeFileSync(fullPath, fileContent, 'utf-8');
      console.log(`✅ Updated ${filePath}`);
      processedCount++;
    } else {
      console.log(`⚠️  Could not find pattern "${after}" in ${filePath}`);
    }
  } catch (error) {
    console.log(`❌ Error processing ${filePath}: ${error}`);
  }
}

console.log(`\n✨ Successfully added meta fields to ${processedCount} tools`);
console.log(`📊 Total tools with meta fields: ${processedCount + 1} (tasks already updated)`);
console.log(`\n🚀 Next: npm run build && npm run ci:local`);

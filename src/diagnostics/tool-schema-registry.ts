// src/diagnostics/tool-schema-registry.ts
// intentionally-exposed-for-CLI (OMN-282): consumed by scripts/diagnose-failures.ts
// (the `npm run diagnose-failures` entry the weekly ~/bin/of-mcp-diagnose launchd
// job runs). scripts/ sits outside tsconfig's src/** include, so ts-prune flags
// these exports as orphans; they are not.
import type { z } from 'zod';
import { CacheManager } from '../cache/CacheManager.js';
import { SystemTool } from '../tools/system/SystemTool.js';
import { OmniFocusReadTool } from '../tools/unified/OmniFocusReadTool.js';
import { OmniFocusWriteTool } from '../tools/unified/OmniFocusWriteTool.js';
import { OmniFocusAnalyzeTool } from '../tools/unified/OmniFocusAnalyzeTool.js';

export interface ToolSchemaEntry {
  name: string;
  /** Single nesting key for read/write/analyze; undefined for the flat `system` schema. */
  wrapperKey?: 'query' | 'mutation' | 'analysis';
  getInputSchema: () => Record<string, unknown>;
  zodSchema: z.ZodTypeAny;
}

// Every BaseTool subclass exposes its Zod schema as a public instance property `schema`
// (SystemTool.ts:93 `schema = SystemToolSchema`; OmniFocusReadTool.ts:205 `schema = ReadSchema`;
// Write:164 `schema = WriteSchema`; Analyze:300 `schema = AnalyzeSchema`). Reading the instance
// property avoids importing non-exported symbols (SystemToolSchema is a non-exported const) and
// needs zero source edits.
const cache = new CacheManager();
const sys = new SystemTool(cache);
const read = new OmniFocusReadTool(cache);
const write = new OmniFocusWriteTool(cache);
const analyze = new OmniFocusAnalyzeTool(cache);

export const TOOL_SCHEMA_REGISTRY: ToolSchemaEntry[] = [
  { name: 'system', getInputSchema: () => sys.inputSchema, zodSchema: sys.schema },
  { name: 'omnifocus_read', wrapperKey: 'query', getInputSchema: () => read.inputSchema, zodSchema: read.schema },
  { name: 'omnifocus_write', wrapperKey: 'mutation', getInputSchema: () => write.inputSchema, zodSchema: write.schema },
  {
    name: 'omnifocus_analyze',
    wrapperKey: 'analysis',
    getInputSchema: () => analyze.inputSchema,
    zodSchema: analyze.schema,
  },
];

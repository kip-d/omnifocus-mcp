/**
 * OMN-169: thin re-export barrel.
 * All definitions live in src/omnifocus/response-schemas/{common,read,analyze,write}.ts.
 * Import sites continue to import from this file — the public surface is unchanged.
 *
 * Rule: re-export ONLY the original 47 public names (44 value schemas + 3 inferred
 * types). The 3 newly-exported helpers
 * in common.ts (isoDate, isoDateOrNull, warningsArray) are NOT re-exported here;
 * they were private before and are consumed only by the domain modules.
 */

// ---------------------------------------------------------------------------
// common — shared factories and envelope schemas
// ---------------------------------------------------------------------------
export {
  V3EnvelopeSuccessSchema,
  v3EnvelopeSchema,
  astEnvelopeSchema,
  listResultSchema,
  reviewSuccessSchema,
} from './response-schemas/common.js';

// ---------------------------------------------------------------------------
// read — row schemas, metadata, tags, perspectives, recurring, count, export,
//         slim, patterns, project-by-id, folder
// ---------------------------------------------------------------------------
export {
  TaskRowSchema,
  ProjectRowSchema,
  TaskListMetadataSchema,
  ProjectListMetadataSchema,
  TagItemSchema,
  TagSummarySchema,
  PerspectiveItemSchema,
  PerspectiveSummarySchema,
  RecurringTaskRowSchema,
  RecurringTasksSummarySchema,
  RecurringTasksMetadataSchema,
  CountResultSchema,
  ExportTaskRowSchema,
  ExportTasksResultSchema,
  ExportProjectRowSchema,
  ExportProjectsResultSchema,
  ExportResultSchema,
  SlimmedDataSchema,
  RecurringPatternsSchema,
  ProjectByIdSchema,
  FolderListSchema,
} from './response-schemas/read.js';

// ---------------------------------------------------------------------------
// analyze — v3 analytics envelopes and the inferred V3 data types
// ---------------------------------------------------------------------------
export {
  PRODUCTIVITY_STATS_V3_SCHEMA,
  TaskVelocityDataSchema,
  TASK_VELOCITY_V3_SCHEMA,
  OverdueAnalysisDataSchema,
  OVERDUE_ANALYSIS_V3_SCHEMA,
  WorkflowAnalysisDataSchema,
  WORKFLOW_ANALYSIS_V3_SCHEMA,
} from './response-schemas/analyze.js';
// OMN-194: OmniFocusAnalyzeTool types its v3 reads against these inferred payload types.
export type { OverdueAnalysisV3Data, TaskVelocityV3Data, WorkflowAnalysisV3Data } from './response-schemas/analyze.js';

// ---------------------------------------------------------------------------
// write — review-family, mutation results, tag mutations
// ---------------------------------------------------------------------------
export {
  REVIEWS_LIST_TYPED_SCHEMA,
  MARK_REVIEWED_TYPED_SCHEMA,
  SET_SCHEDULE_TYPED_SCHEMA,
  TaskWriteResultSchema,
  CompleteResultSchema,
  DeleteResultSchema,
  BulkDeleteResultSchema,
  ProjectWriteResultSchema,
  FolderCreateResultSchema,
  BatchCreateResultSchema,
  TagMutationResultSchema,
} from './response-schemas/write.js';

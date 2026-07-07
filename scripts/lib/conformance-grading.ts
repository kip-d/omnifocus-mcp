// scripts/lib/conformance-grading.ts
// Grading core of the LLM conformance probe (OMN-121/122), extracted from
// scripts/llm-conformance-probe.ts so it is unit-testable (the probe script
// runs main() at import time — same rationale as ollama-lifecycle.ts).
//
// OMN-246: every failing grade persists the model's RAW tool-call arguments
// (`rawArgs`). The 2026-06-12 qwen failures were unrecoverable because only
// Zod issue strings were recorded — strict errors fully determined one root
// shape and left two forever unknown (OMN-168). rawArgs makes any future
// failure diagnosable from the probe's own output.
import type { ZodTypeAny } from 'zod';
import { parseWithNormalization } from '../../src/tools/normalization/normalize-input.js';

export type Outcome = 'pass' | 'no_tool_call' | 'wrong_tool' | 'schema_invalid' | 'model_error';

export interface ConformanceCase {
  id: string;
  prompt: string;
  /** Tool name(s) that count as a correct selection for this intent. */
  expect: string[];
  note: string;
}

/** Structural subset of Ollama's ToolCall — all the grader reads. */
export interface GradableToolCall {
  function: { name: string; arguments: unknown };
}

export interface CaseResult {
  caseId: string;
  outcome: Outcome;
  toolCalled?: string;
  /** Top Zod issues (path + message) when schema_invalid. */
  issues?: string[];
  /** OMN-122: leniencies the normalize-then-strict layer applied to make this pass. */
  normalizedVia?: string[];
  detail?: string;
  /**
   * OMN-246: the model's raw tool-call arguments, verbatim (JSON-serialized,
   * capped), present on every non-pass outcome that carried arguments. This is
   * the failure ARTIFACT — issue strings alone underdetermine the payload.
   */
  rawArgs?: string;
}

/** Cap on a persisted rawArgs string — big enough for any real envelope, small
 * enough that a runaway generation can't bloat the report. */
export const RAW_ARGS_CAP = 4_000;

/** JSON-serialize a model's raw arguments for persistence; truncation and
 * serialization failures are LOUD markers, never silent. */
export function serializeRawArgs(args: unknown): string {
  let s: string;
  if (typeof args === 'string') {
    s = args;
  } else {
    try {
      // JSON.stringify(undefined) returns the VALUE undefined, not a string —
      // fall back to String() so an argument-less tool call can't throw here.
      s = JSON.stringify(args) ?? String(args);
    } catch (err) {
      return `[unserializable arguments: ${String(err)}]`;
    }
  }
  if (s.length > RAW_ARGS_CAP) {
    return `${s.slice(0, RAW_ARGS_CAP)}…[truncated from ${s.length} chars]`;
  }
  return s;
}

/**
 * Grade a model's first tool call against the advertised strict schemas via the
 * server's REAL front door — strict first, then the normalize-then-strict layer
 * (OMN-122). A pass that needed normalization is still a pass (the server would
 * accept it), and the load-bearing leniencies are recorded.
 */
export function gradeToolCall(
  c: ConformanceCase,
  call: GradableToolCall | undefined,
  schemaByTool: Record<string, ZodTypeAny>,
): CaseResult {
  if (!call) return { caseId: c.id, outcome: 'no_tool_call' };
  const name = call.function.name;
  const rawArgs = serializeRawArgs(call.function.arguments);
  if (!c.expect.includes(name)) {
    return { caseId: c.id, outcome: 'wrong_tool', toolCalled: name, rawArgs };
  }
  const schema = schemaByTool[name];
  if (!schema) {
    return { caseId: c.id, outcome: 'wrong_tool', toolCalled: name, detail: 'no schema registered', rawArgs };
  }

  // Ollama returns arguments as a parsed object; tolerate a stringified payload too.
  let args: unknown = call.function.arguments;
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch {
      return {
        caseId: c.id,
        outcome: 'schema_invalid',
        toolCalled: name,
        issues: ['arguments not valid JSON'],
        rawArgs,
      };
    }
  }
  const result = parseWithNormalization(schema, args, name);
  if (result.success) {
    return {
      caseId: c.id,
      outcome: 'pass',
      toolCalled: name,
      normalizedVia: result.applied.length ? result.applied : undefined,
    };
  }
  const issues = result.error!.issues.slice(0, 4).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  return { caseId: c.id, outcome: 'schema_invalid', toolCalled: name, issues, rawArgs };
}

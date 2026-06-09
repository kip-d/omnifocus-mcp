/**
 * Custom ESLint rules for OmniFocus MCP coding standards.
 *
 * ESLint 9 flat-config plugin: top-level `meta` + `rules`, ESM default export.
 * Uses ESLint 9 context properties (`context.filename`, `context.sourceCode`)
 * rather than the deprecated `getFilename()` / `getSourceCode()` methods.
 */

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function enclosingFunction(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (FUNCTION_TYPES.has(n.type)) return n;
  }
  return null;
}

// Response-contract type names whose presence in a method's return-type
// annotation means the method produces a tool response and is subject to
// the use-standard-response / use-handle-error rules. `SystemResponse`
// (SystemTool.ts) is a type alias for StandardResponseV2; matched explicitly
// because the old substring check missed it. NO trailing \b — plain
// `StandardResponse` must still match the longer `StandardResponseV2` (no word
// boundary exists between `...Response` and `V2`); a trailing \b would silently
// stop enforcing the ~8 methods annotated StandardResponseV2<...> checked today.
// MONITORS: StandardResponseV2, SystemResponse
// (The regex matches the `StandardResponse` prefix — by design (see above) —
// so it covers `StandardResponseV2` too. The MONITORS annotation lists the
// actual identifiers live in src/, which is what the meta-check verifies.)
const RESPONSE_CONTRACT_TYPES = /\b(StandardResponse|SystemResponse)/;

const plugin = {
  meta: {
    name: 'omnifocus-mcp-local',
    version: '1.0.0',
  },
  rules: {
    'extend-base-tool': {
      meta: {
        type: 'problem',
        docs: { description: 'Tool classes must extend BaseTool' },
        schema: [],
        messages: {
          mustExtendBaseTool: 'Tool classes must extend BaseTool',
        },
      },
      create(context) {
        return {
          ClassDeclaration(node) {
            if (!node.id || !node.id.name.endsWith('Tool')) return;
            if (!node.superClass || node.superClass.type !== 'Identifier' || node.superClass.name !== 'BaseTool') {
              context.report({ node, messageId: 'mustExtendBaseTool' });
            }
          },
        };
      },
    },

    'use-standard-response': {
      meta: {
        type: 'suggestion',
        docs: {
          description:
            'Tool-response methods should construct results via createSuccessResponseV2 / createErrorResponseV2 / createListResponseV2, not plain object literals',
        },
        schema: [],
        messages: {
          useStandardResponse:
            'Use createSuccessResponseV2, createErrorResponseV2, or createListResponseV2 instead of returning a plain {success|data} object literal',
        },
      },
      create(context) {
        const filename = context.filename;
        if (!filename.includes('/tools/') || !filename.endsWith('Tool.ts')) return {};

        return {
          ReturnStatement(node) {
            if (!node.argument || node.argument.type !== 'ObjectExpression') return;

            // Only enforce inside methods that are annotated as producing a
            // StandardResponse — helpers returning internal envelopes (unknown,
            // domain objects) are not subject to this contract.
            const fn = enclosingFunction(node);
            if (!fn || !fn.returnType) return;
            const annText = context.sourceCode.getText(fn.returnType);
            if (!RESPONSE_CONTRACT_TYPES.test(annText)) return;

            const keys = node.argument.properties
              .map((p) => (p.type === 'Property' && p.key && (p.key.name || p.key.value)) || null)
              .filter(Boolean);
            if (keys.includes('success') || keys.includes('data')) {
              context.report({ node, messageId: 'useStandardResponse' });
            }
          },
        };
      },
    },

    'use-handle-error': {
      meta: {
        type: 'suggestion',
        docs: {
          description:
            'Catch blocks that return must route through a standard error sink (this.handleError[V2] or createErrorResponse[V2]) or rethrow',
        },
        schema: [],
        messages: {
          useHandleError:
            'Catch blocks that return should use this.handleErrorV2(error), createErrorResponseV2(...), or rethrow — not return a plain object',
        },
      },
      create(context) {
        const filename = context.filename;
        if (!filename.includes('/tools/') || !filename.endsWith('Tool.ts')) return {};

        // MONITORS: handleErrorV2, createErrorResponseV2
        // (`throw` is a JS keyword — always present; not a renamable identifier
        // and excluded from the meta-check.)
        const VALID_SINK = /\bthis\.handleError(V2)?\b|\bcreateErrorResponse(V2)?\b|\bthrow\b/;

        return {
          CatchClause(node) {
            // Only flag catches inside methods that produce tool responses —
            // i.e., whose return-type annotation mentions StandardResponse.
            const fn = enclosingFunction(node);
            if (!fn || !fn.returnType) return;
            const annText = context.sourceCode.getText(fn.returnType);
            if (!RESPONSE_CONTRACT_TYPES.test(annText)) return;

            const text = context.sourceCode.getText(node.body);
            // Side-effecting catch blocks (no return) record sub-task results
            // in loops; the consistent-error-response contract doesn't apply.
            if (!/\breturn\b/.test(text)) return;
            if (VALID_SINK.test(text)) return;
            context.report({ node, messageId: 'useHandleError' });
          },
        };
      },
    },

    'metadata-snake-case': {
      meta: {
        type: 'suggestion',
        docs: { description: 'Metadata fields in response builders must use snake_case' },
        schema: [],
        messages: {
          snakeCaseMetadata: "Metadata field '{{key}}' should use snake_case naming",
        },
      },
      create(context) {
        // Per-builder metadata-arg index. V1 builders were retired in PR #3
        // (commit f2d04e8) and have zero non-import occurrences in src/ —
        // their entries here were dead. Removed so the meta-check
        // (tests/unit/eslint-rules/monitored-identifiers-live.test.ts) stays
        // green and so this list reflects what's actually in production.
        // Signatures are not uniform:
        //   createSuccessResponseV2(op, data, summary?, metadata?)   — 4th arg.
        //   createListResponseV2   (op, items, itemType, metadata?)  — 4th arg.
        //   createErrorResponseV2  (op, code, msg, suggestion?, details?, metadata?) — 6th arg.
        //   createTaskResponseV2   (op, tasks, metadata?)            — 3rd arg.
        //   createAnalyticsResponseV2 (op, data, analysisType, keyFindings, metadata?) — 5th arg.
        // MONITORS: createSuccessResponseV2, createErrorResponseV2, createListResponseV2, createTaskResponseV2, createAnalyticsResponseV2
        const METADATA_ARG_INDEX = {
          createSuccessResponseV2: 3,
          createErrorResponseV2: 5,
          createListResponseV2: 3,
          createTaskResponseV2: 2,
          createAnalyticsResponseV2: 4,
        };
        return {
          Property(node) {
            const objExpr = node.parent;
            if (!objExpr || objExpr.type !== 'ObjectExpression') return;
            const call = objExpr.parent;
            if (!call || call.type !== 'CallExpression') return;
            const callee = call.callee;
            const calleeName =
              (callee && callee.type === 'Identifier' && callee.name) ||
              (callee && callee.type === 'MemberExpression' && callee.property && callee.property.name) ||
              null;
            const metaIndex = calleeName ? METADATA_ARG_INDEX[calleeName] : undefined;
            if (typeof metaIndex !== 'number') return;
            if (call.arguments[metaIndex] !== objExpr) return;

            const key = (node.key && (node.key.name || node.key.value)) || null;
            if (typeof key === 'string' && !/^[a-z0-9]+(_[a-z0-9]+)*$/.test(key)) {
              context.report({ node, messageId: 'snakeCaseMetadata', data: { key } });
            }
          },
        };
      },
    },

    'export-zod-schema': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Schema files must import zod and export at least one *Schema binding',
        },
        schema: [],
        messages: {
          missingZodImport: 'Schema files must import from zod',
          missingSchemaExport: 'Schema files must export at least one Schema',
        },
      },
      create(context) {
        const filename = context.filename;
        // ASSUMPTION: detects only inline `export const XSchema = ...`. All
        // schema files use that form today; `export { XSchema }` / re-export
        // forms are intentionally not handled (YAGNI — no such file exists).
        if (!filename.includes('/schemas/') || !filename.endsWith('.ts')) return {};

        // Files named *helper*.ts are utility modules (e.g., coerceBoolean factories)
        // colocated with schemas — they import zod but don't define Schemas directly.
        const isHelperModule = /helpers?\.ts$/i.test(filename);

        let hasZodImport = false;
        let hasSchemaExport = false;

        return {
          ImportDeclaration(node) {
            if (node.source.value === 'zod') hasZodImport = true;
          },
          ExportNamedDeclaration(node) {
            const decls = node.declaration && node.declaration.declarations;
            if (!decls) return;
            for (const d of decls) {
              const name = d.id && d.id.name;
              if (typeof name === 'string' && /Schema/.test(name)) {
                hasSchemaExport = true;
              }
            }
          },
          'Program:exit'(programNode) {
            if (!hasZodImport) {
              context.report({ node: programNode, messageId: 'missingZodImport' });
            }
            if (!hasSchemaExport && !isHelperModule) {
              context.report({ node: programNode, messageId: 'missingSchemaExport' });
            }
          },
        };
      },
    },

    'no-whose-where': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Ban JXA .whose() / .where(): each predicate is serialized as a separate Apple Event round-trip, causing 25s+ timeouts on large databases. Iterate flattenedTasks directly instead. See docs/dev/LESSONS_LEARNED.md.',
        },
        schema: [],
        messages: {
          noWhoseWhere:
            "JXA '.{{method}}()' serializes one Apple Event per item and hangs 25s+ on large databases. Iterate flattenedTasks directly (e.g. .filter on the array) instead — see docs/dev/LESSONS_LEARNED.md.",
        },
      },
      // Intentionally carries no monitored-identifier annotation. This rule
      // flags a banned AST shape (.whose / .where) that must have ZERO
      // occurrences in src/ — the live-occurrence meta-check would (correctly)
      // fail on absence. The rule depends on no renamable codebase symbol.
      create(context) {
        // Double-gate (cf. export-zod-schema): eslint.config.js scopes this to
        // src/omnifocus/scripts/**, and the body re-checks the path so the rule
        // stays correct if ever applied via a broader config. `.where` can be a
        // legitimate method name in general TS; inside the OmniJS/JXA script
        // layer it is only ever the JXA timeout footgun.
        if (!context.filename.includes('/omnifocus/scripts/')) return {};
        return {
          CallExpression(node) {
            const callee = node.callee;
            if (!callee || callee.type !== 'MemberExpression' || callee.computed) return;
            const prop = callee.property;
            if (!prop || prop.type !== 'Identifier') return;
            if (prop.name === 'whose' || prop.name === 'where') {
              context.report({ node: prop, messageId: 'noWhoseWhere', data: { method: prop.name } });
            }
          },
        };
      },
    },
  },
};

export default plugin;

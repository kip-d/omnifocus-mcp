import { getUnifiedHelpers } from '../shared/helpers.js';

/**
 * OMN-155: enumerate OmniFocus perspectives WITH their archived filter rules.
 *
 * `archivedFilterRules` / `archivedTopLevelFilterAggregation` are OmniJS-only
 * (the legacy pure-JXA path could only hardcode `filterRules: null`), so the whole
 * enumeration runs inside `app.evaluateJavascript`. This is a read-side OmniJS
 * boundary — embedded via the canonical OMN-129 safe pattern
 * (`evaluateJavascript(${JSON.stringify(program)})`, no nested backticks) so it does
 * not reopen the OMN-111/113 injection class. No user input enters the program.
 *
 * Step-0 probe findings baked into the program (see Technical/specs/OMN-155-…):
 *  - `archivedFilterRules` THROWS "not found" on most custom perspectives → each
 *    perspective's rule read is guarded individually; a throw → null count/rules,
 *    never an aborted enumeration.
 *  - rules are a plain JSON-serializable Array; aggregation is "all" | null.
 *  - built-ins expose no archived rules → all three rule fields null.
 *
 * `{{includeFull}}` is substituted to `true`/`false` by OmniAutomation.buildScript
 * (formatValue(boolean)). It gates only whether the full `filterRules` ARRAY rides
 * along — the count + aggregation are always read (they need the bridge regardless).
 */
export const PERSPECTIVES_OMNI_PROGRAM = `(() => {
  const includeFull = {{includeFull}};
  const safe = (fn) => { try { return { ok: true, v: fn() }; } catch (e) { return { ok: false }; } };

  const items = [];

  // Built-in perspectives: no archived filter rules → all rule fields null.
  const builtinAll = safe(() => Perspective.BuiltIn.all);
  if (builtinAll.ok && builtinAll.v) {
    for (let i = 0; i < builtinAll.v.length; i++) {
      const b = builtinAll.v[i];
      const nameRes = safe(() => b.name);
      items.push({
        name: nameRes.ok && typeof nameRes.v === 'string' ? nameRes.v : '',
        type: 'builtin',
        isBuiltIn: true,
        identifier: null,
        filterRules: null,
        filterRuleCount: null,
        filterAggregation: null,
      });
    }
  }

  // Custom perspectives: archivedFilterRules is OmniJS-only AND throws "not found"
  // on many perspectives → guard EACH read independently (load-bearing).
  const customAll = safe(() => Perspective.Custom.all);
  if (customAll.ok && customAll.v) {
    for (let j = 0; j < customAll.v.length; j++) {
      const p = customAll.v[j];
      const nameRes = safe(() => p.name);
      const idRes = safe(() => p.identifier);
      const aggRes = safe(() => p.archivedTopLevelFilterAggregation);
      const rulesRes = safe(() => p.archivedFilterRules);
      const rules = rulesRes.ok && Array.isArray(rulesRes.v) ? rulesRes.v : null;
      items.push({
        name: nameRes.ok && typeof nameRes.v === 'string' ? nameRes.v : '',
        type: 'custom',
        isBuiltIn: false,
        identifier: idRes.ok && typeof idRes.v === 'string' ? idRes.v : null,
        filterRules: includeFull ? rules : null,
        filterRuleCount: rules ? rules.length : null,
        filterAggregation: aggRes.ok && typeof aggRes.v === 'string' ? aggRes.v : null,
      });
    }
  }

  const builtInCount = items.filter((x) => x.isBuiltIn).length;
  return JSON.stringify({
    items: items,
    summary: {
      total: items.length,
      insights: ['Found ' + items.length + ' perspectives (' + builtInCount + ' built-in, ' + (items.length - builtInCount) + ' custom)'],
    },
  });
})()`;

/**
 * JXA outer wrapper. Runs the OmniJS program via the safe bridge and returns its
 * JSON string straight through (per-perspective errors are handled INSIDE the
 * program; this catch only fires if the whole bridge call fails).
 */
export const LIST_PERSPECTIVES_SCRIPT = `
  ${getUnifiedHelpers()}

  (() => {
    const app = Application('OmniFocus');

    try {
      const resultJson = app.evaluateJavascript(${JSON.stringify(PERSPECTIVES_OMNI_PROGRAM)});
      return resultJson;
    } catch (error) {
      return formatError(error, 'list_perspectives');
    }
  })();
`;

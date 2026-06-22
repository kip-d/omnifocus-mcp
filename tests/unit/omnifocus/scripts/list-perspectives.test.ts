/**
 * OMN-155: vm-oracle for the perspectives enumeration OmniJS program.
 *
 * The real program runs inside app.evaluateJavascript against live OmniFocus
 * (CI-blind). This test exercises its projection LOGIC against mock
 * Perspective.BuiltIn / Perspective.Custom objects in a Node vm — no live app.
 *
 * Covers the three Step-0 findings that shaped the implementation:
 *  - built-ins → all rule fields null
 *  - custom with rules → counts-only by default; full array under includeFull
 *  - custom whose archivedFilterRules access THROWS ("not found" on 14/22 real
 *    perspectives) → filterRuleCount:null, filterRules:null, NOT a crash
 */
import * as vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import { PERSPECTIVES_OMNI_PROGRAM } from '../../../../src/omnifocus/scripts/perspectives/list-perspectives.js';
import { PerspectiveItemSchema } from '../../../../src/omnifocus/response-schemas/read.js';

interface PerspectiveRow {
  name: string;
  type: string;
  isBuiltIn: boolean;
  identifier: string | null;
  filterRules: unknown[] | null;
  filterRuleCount: number | null;
  filterAggregation: string | null;
}

/**
 * Substitute the {{includeFull}} placeholder exactly as OmniAutomation.buildScript
 * does (formatValue(boolean) → 'true' | 'false'), then run the program in a vm with
 * the mocked OmniJS globals it touches.
 */
function runProgram(
  includeFull: boolean,
  perspectiveMock: { BuiltIn: { all: unknown[] }; Custom: { all: unknown[] } },
): { items: PerspectiveRow[]; summary: { total: number; insights: string[] } } {
  const script = PERSPECTIVES_OMNI_PROGRAM.replace(/\{\{includeFull\}\}/g, includeFull ? 'true' : 'false');
  const sandbox: Record<string, unknown> = { Perspective: perspectiveMock, JSON };
  return JSON.parse(vm.runInNewContext(script, sandbox) as string);
}

// A custom perspective whose archivedFilterRules getter THROWS — the load-bearing
// Step-0 finding (14/22 real perspectives do this).
function throwingCustom(name: string, identifier: string) {
  return {
    name,
    identifier,
    get archivedTopLevelFilterAggregation() {
      return null;
    },
    get archivedFilterRules(): unknown {
      throw new Error('not found');
    },
  };
}

function rulesCustom(name: string, identifier: string, rules: unknown[], aggregation: string | null) {
  return { name, identifier, archivedTopLevelFilterAggregation: aggregation, archivedFilterRules: rules };
}

const BUILTINS = { all: [{ name: 'Inbox' }, { name: 'Flagged' }, { name: 'Search' }] };

describe('OMN-155: perspectives OmniJS program (vm-oracle)', () => {
  it('built-in perspectives → all three rule fields null, isBuiltIn:true', () => {
    const out = runProgram(false, { BuiltIn: BUILTINS, Custom: { all: [] } });
    expect(out.items).toHaveLength(3);
    for (const row of out.items) {
      expect(row.isBuiltIn).toBe(true);
      expect(row.type).toBe('builtin');
      expect(row.identifier).toBeNull();
      expect(row.filterRules).toBeNull();
      expect(row.filterRuleCount).toBeNull();
      expect(row.filterAggregation).toBeNull();
    }
  });

  it('custom with rules, counts-only default: filterRuleCount set, filterRules null, aggregation surfaced', () => {
    const custom = {
      all: [rulesCustom('Today', 'i4kJc8VpOmj', [{ actionAvailability: 'remaining' }, { actionStatus: 'due' }], 'all')],
    };
    const out = runProgram(false, { BuiltIn: { all: [] }, Custom: custom });
    const today = out.items.find((r) => r.name === 'Today')!;
    expect(today.isBuiltIn).toBe(false);
    expect(today.filterRuleCount).toBe(2);
    expect(today.filterRules).toBeNull(); // counts-only — no array
    expect(today.filterAggregation).toBe('all');
  });

  it('custom with rules, includeFull:true: full rules array rides along', () => {
    const rules = [{ actionAvailability: 'remaining' }, { actionStatus: 'due' }];
    const custom = { all: [rulesCustom('Today', 'i4kJc8VpOmj', rules, 'all')] };
    const out = runProgram(true, { BuiltIn: { all: [] }, Custom: custom });
    const today = out.items.find((r) => r.name === 'Today')!;
    expect(today.filterRuleCount).toBe(2);
    expect(today.filterRules).toEqual(rules);
  });

  it('custom whose archivedFilterRules THROWS "not found": count+rules null, no crash, still listed', () => {
    const custom = { all: [throwingCustom('Dormant', 'd8FZImGrp7N')] };
    const out = runProgram(true, { BuiltIn: { all: [] }, Custom: custom });
    expect(out.items).toHaveLength(1);
    const dormant = out.items[0];
    expect(dormant.name).toBe('Dormant');
    expect(dormant.identifier).toBe('d8FZImGrp7N');
    expect(dormant.filterRuleCount).toBeNull();
    expect(dormant.filterRules).toBeNull();
    expect(dormant.filterAggregation).toBeNull();
  });

  it('mixed set: a throwing custom does not abort enumeration of the others', () => {
    const custom = {
      all: [
        throwingCustom('Dormant', 'd8FZImGrp7N'),
        rulesCustom('Right Now', 'aKJKhQv7jmf', [{ actionAvailability: 'available' }], 'all'),
        throwingCustom('Do', 'pxYYfZICRFG'),
      ],
    };
    const out = runProgram(false, { BuiltIn: BUILTINS, Custom: custom });
    // 3 built-ins + 3 customs all present
    expect(out.items).toHaveLength(6);
    const rightNow = out.items.find((r) => r.name === 'Right Now')!;
    expect(rightNow.filterRuleCount).toBe(1);
    expect(out.summary.total).toBe(6);
  });

  it('non-string aggregation (e.g. null object) is normalized to null', () => {
    const custom = { all: [rulesCustom('Completed', 'ProcessCompleted', [{ actionAvailability: 'completed' }], null)] };
    const out = runProgram(false, { BuiltIn: { all: [] }, Custom: custom });
    expect(out.items[0].filterAggregation).toBeNull();
    expect(out.items[0].filterRuleCount).toBe(1);
  });

  // Cross-layer guard: the script runs inside evaluateJavascript (CI-blind), but
  // execJson validates its output against PerspectiveItemSchema. Prove the emitted
  // row shape satisfies that strict schema so the two layers can't drift unseen.
  it('every emitted row validates against the strict PerspectiveItemSchema (both modes)', () => {
    const custom = {
      all: [
        throwingCustom('Dormant', 'd8FZImGrp7N'),
        rulesCustom('Today', 'i4kJc8VpOmj', [{ actionStatus: 'due' }], 'all'),
      ],
    };
    for (const includeFull of [false, true]) {
      const out = runProgram(includeFull, { BuiltIn: BUILTINS, Custom: custom });
      for (const row of out.items) {
        const parsed = PerspectiveItemSchema.safeParse(row);
        expect(
          parsed.success,
          `${row.name} (includeFull=${includeFull}): ${JSON.stringify(parsed.error?.issues)}`,
        ).toBe(true);
      }
    }
  });
});

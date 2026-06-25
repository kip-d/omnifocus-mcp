import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSharedClient } from '../helpers/shared-server.js';
import { MCPTestClient } from '../helpers/mcp-test-client.js';
import { expectOk } from '../helpers/expect-ok.js';
import { daysFromToday } from '../helpers/dates.js';

/**
 * Single source of truth for the server's text-filter contract (name OR note,
 * case-insensitive), so the predicate lands in one place instead of drifting
 * across copies.
 *
 * NOTE: reads `task.note`, which is only populated when the query projects it
 * (`details: true`, or `note` in an explicit `fields` list). Calling this on a
 * task fetched without the note field would false-negative on note-only matches.
 * Every caller below projects the note; preserve that if you reuse this.
 */
const matchesText = (task: any, term: string): boolean => {
  const t = term.toLowerCase();
  return Boolean(task.name?.toLowerCase().includes(t) || task.note?.toLowerCase().includes(t));
};

/**
 * P0 Priority: Filter Results Validation
 *
 * PURPOSE: Prevent bugs like #9 (text filter) and #10 (date range filter)
 * by validating that filters return ONLY matching results.
 *
 * PATTERN: query with filter → validate EVERY result matches filter
 *
 * OPTIMIZATION: Uses shared server to avoid 13s startup per test file
 */
describe('Filter Results Validation', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    // Use shared server - avoids 13s startup cost per test file
    client = await getSharedClient();
  }, 30000);

  afterAll(async () => {
    // Don't stop server - globalTeardown handles shared server cleanup
  });

  describe('Text Filter (Bug #9 Prevention)', () => {
    it('should return ONLY tasks containing search text in name or note', async () => {
      const searchTerm = 'meeting';

      const data = await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: {
            text: { contains: searchTerm },
          },
          details: true,
          limit: 100,
        },
      });

      // ✅ Validate response structure
      expectOk(data, 'text filter');
      expect(Array.isArray(data.data?.tasks)).toBe(true);

      if (data.data.tasks.length > 0) {
        // ✅ Validate EVERY result matches filter
        data.data.tasks.forEach((task: any, index: number) => {
          const matchesFilter = matchesText(task, searchTerm);

          expect(matchesFilter).toBe(true);

          // If this fails, show which task and why
          if (!matchesFilter) {
            console.error(`Task ${index} doesn't match filter:`, {
              id: task.id,
              name: task.name,
              note: task.note?.substring(0, 50),
              searchTerm,
            });
          }
        });
      }
    }, 60000);
  });

  describe('Date Range Filter (Bug #10 Prevention)', () => {
    it('should return ONLY tasks within specified date range', async () => {
      const startStr = daysFromToday(-7);
      const endStr = daysFromToday(7);

      const data = await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: {
            dueDate: { between: [startStr, endStr] },
          },
          limit: 100,
        },
      });

      expectOk(data, 'date range filter');
      expect(Array.isArray(data.data?.tasks)).toBe(true);

      if (data.data.tasks.length > 0) {
        // ✅ Validate EVERY result is in range
        data.data.tasks.forEach((task: any, index: number) => {
          expect(task.dueDate).toBeDefined();

          const taskDate = task.dueDate.split('T')[0];
          const isInRange = taskDate >= startStr && taskDate <= endStr;

          expect(isInRange).toBe(true);

          // If this fails, show which task and date
          if (!isInRange) {
            console.error(`Task ${index} outside date range:`, {
              id: task.id,
              name: task.name,
              dueDate: task.dueDate,
              expected: `${startStr} to ${endStr}`,
            });
          }
        });

        // ✅ Validate no tasks without due dates
        const tasksWithoutDates = data.data.tasks.filter((t: any) => !t.dueDate);
        expect(tasksWithoutDates.length).toBe(0);
      }
    }, 60000);

    it('should exclude tasks before start date', async () => {
      const startStr = daysFromToday(1); // Tomorrow
      const endStr = daysFromToday(7); // Next week

      const data = await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: {
            dueDate: { between: [startStr, endStr] },
          },
          limit: 100,
        },
      });

      if (data.data?.tasks?.length > 0) {
        // ✅ Validate NO tasks before start date
        data.data.tasks.forEach((task: any) => {
          const taskDate = task.dueDate.split('T')[0];
          expect(taskDate >= startStr).toBe(true);
        });
      }
    }, 60000);
  });

  describe('Tag Filter Operators (Bug #12 Extension)', () => {
    it('should return tasks with ANY of specified tags', async () => {
      const requiredTags = ['Personal', 'Work']; // Common tags likely to exist

      const data = await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: {
            tags: { any: requiredTags },
          },
          fields: ['id', 'name', 'tags'],
          limit: 50,
        },
      });

      expectOk(data, 'tag filter (any)');
      expect(Array.isArray(data.data?.tasks)).toBe(true);

      if (data.data.tasks.length > 0) {
        // ✅ Validate EVERY result has at least one required tag
        data.data.tasks.forEach((task: any, index: number) => {
          expect(Array.isArray(task.tags)).toBe(true);

          const hasRequiredTag = task.tags.some((tag: string) => requiredTags.includes(tag));

          expect(hasRequiredTag).toBe(true);

          // If this fails, show which task and tags
          if (!hasRequiredTag) {
            console.error(`Task ${index} missing required tags:`, {
              id: task.id,
              name: task.name,
              actualTags: task.tags,
              requiredTags,
            });
          }
        });
      }
    }, 60000);

    it('should return tasks with ALL specified tags', async () => {
      const requiredTags = ['Personal', 'Work']; // Tasks must have both

      const data = await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: {
            tags: { all: requiredTags },
          },
          fields: ['id', 'name', 'tags'],
          limit: 50,
        },
      });

      expectOk(data, 'tag filter (all)');
      expect(Array.isArray(data.data?.tasks)).toBe(true);

      if (data.data.tasks.length > 0) {
        // ✅ Validate EVERY result has ALL required tags
        data.data.tasks.forEach((task: any, index: number) => {
          expect(Array.isArray(task.tags)).toBe(true);

          const hasAllTags = requiredTags.every((requiredTag: string) => task.tags.includes(requiredTag));

          expect(hasAllTags).toBe(true);

          // If this fails, show which task and missing tags
          if (!hasAllTags) {
            const missingTags = requiredTags.filter((tag: string) => !task.tags.includes(tag));
            console.error(`Task ${index} missing required tags:`, {
              id: task.id,
              name: task.name,
              actualTags: task.tags,
              requiredTags,
              missingTags,
            });
          }
        });
      }
    }, 60000);

    it('should exclude tasks with specified tags (none operator)', async () => {
      const excludedTags = ['Waiting', 'Someday']; // Tasks must not have these

      const data = await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: {
            tags: { none: excludedTags },
          },
          fields: ['id', 'name', 'tags'],
          limit: 50,
        },
      });

      expectOk(data, 'tag filter (none)');
      expect(Array.isArray(data.data?.tasks)).toBe(true);

      if (data.data.tasks.length > 0) {
        // ✅ Validate NO result has excluded tags
        data.data.tasks.forEach((task: any, index: number) => {
          expect(Array.isArray(task.tags)).toBe(true);

          const hasExcludedTag = task.tags.some((tag: string) => excludedTags.includes(tag));

          expect(hasExcludedTag).toBe(false);

          // If this fails, show which task has excluded tags
          if (hasExcludedTag) {
            const foundExcludedTags = task.tags.filter((tag: string) => excludedTags.includes(tag));
            console.error(`Task ${index} has excluded tags:`, {
              id: task.id,
              name: task.name,
              actualTags: task.tags,
              excludedTags,
              foundExcludedTags,
            });
          }
        });
      }
    }, 60000);
  });

  describe('Combined Filters (P0-3: Complex Queries)', () => {
    it('should apply text + date filters together', async () => {
      const searchTerm = 'review'; // Common word
      const startStr = daysFromToday(-30);
      const endStr = daysFromToday(30);

      const data = await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: {
            text: { contains: searchTerm },
            dueDate: { between: [startStr, endStr] },
          },
          details: true,
          limit: 50,
        },
      });

      expectOk(data, 'combined text + date filter');

      if (data.data?.tasks?.length > 0) {
        // ✅ Validate EVERY result matches ALL filters
        data.data.tasks.forEach((task: any) => {
          // Text filter
          expect(matchesText(task, searchTerm)).toBe(true);

          // Date range filter
          const taskDate = task.dueDate?.split('T')[0];
          expect(taskDate).toBeDefined();
          expect(taskDate >= startStr && taskDate <= endStr).toBe(true);
        });
      }
    }, 60000);

    // OMN-135: combined text + date + tag was never exercised simultaneously
    // (siblings cover text+date and tag-any: separately). A regression of the
    // v3.0.0-refactor kind — one of the three filters silently dropped — would
    // produce a result violating the dropped condition. This per-member check
    // is truncation-immune and catches exactly that class.
    it('should apply text + date + tag filters together (every result matches all three)', async () => {
      const searchTerm = 'review'; // common word, matches sibling text+date case
      const requiredTags = ['Personal', 'Work']; // common tags, matches sibling tag-any case

      const startStr = daysFromToday(-30);
      const endStr = daysFromToday(30);

      const data = await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: {
            text: { contains: searchTerm },
            dueDate: { between: [startStr, endStr] },
            tags: { any: requiredTags },
          },
          details: true, // returns name, note, dueDate, tags (DEFAULT_FIELDS)
          limit: 100,
        },
      });

      expectOk(data, 'combined text + date + tag filter');
      expect(Array.isArray(data.data?.tasks)).toBe(true);

      if (data.data.tasks.length > 0) {
        // ✅ Validate EVERY result matches ALL THREE filters simultaneously
        data.data.tasks.forEach((task: any, index: number) => {
          const okText = matchesText(task, searchTerm);

          // Date range filter
          const taskDate = task.dueDate?.split('T')[0];
          const okDate = taskDate !== undefined && taskDate >= startStr && taskDate <= endStr;

          // Tag filter (at least one required tag)
          const okTag = Array.isArray(task.tags) && task.tags.some((tag: string) => requiredTags.includes(tag));

          // Diagnostics BEFORE the assertions: expect() throws synchronously, so a
          // log placed after the first failing expect() would never run, leaving CI
          // with a contextless "expected false to be true".
          if (!(okText && okDate && okTag)) {
            console.error(`Task ${index} fails combined text+date+tag filter:`, {
              id: task.id,
              name: task.name,
              note: task.note?.substring(0, 50),
              dueDate: task.dueDate,
              tags: task.tags,
              expected: { searchTerm, dateRange: `${startStr}..${endStr}`, requiredTags },
              matched: { okText, okDate, okTag },
            });
          }

          expect(okText).toBe(true);
          // Assert dueDate presence separately from the range check so a server bug that
          // returns an undated task surfaces as "expected undefined to be defined", matching
          // the sibling text+date test, rather than collapsing into okDate's "false".
          expect(taskDate, 'dueDate filter returned a task with no dueDate').toBeDefined();
          expect(okDate).toBe(true);
          expect(okTag).toBe(true);
        });
      }
    }, 90000);

    // OMN-135 (2026-06-09 scope addition): prove OR branches do NOT flatten to
    // the first condition. The June 2026 fork audit (see
    // docs/CONCERNS-RESPONSE-2026-06.md) claimed "OR flattens to first condition";
    // a static code-trace refuted it but no integration test proved the refutation
    // at runtime. Per-member validation CANNOT catch a flatten-to-first bug (every
    // member of a flattened result still satisfies branch 1), so this asserts
    // result-set MEMBERSHIP equals the union computed manually from the two
    // single-branch queries.
    it('should return the UNION of OR branches (membership equals manually-computed union)', async (ctx) => {
      const startStr = daysFromToday(-14);
      const endStr = daysFromToday(14);

      // Naturally-small branches keep all three result sets under the limit, so
      // the exact union comparison stays sound (large branches like available:true
      // would truncate and break set algebra).
      const branch1 = { flagged: true };
      const branch2 = { dueDate: { between: [startStr, endStr] } };

      const fetch = async (filters: any) => {
        const res = await client.callTool('omnifocus_read', {
          query: {
            type: 'tasks',
            filters,
            fields: ['id', 'name', 'flagged', 'dueDate'],
            limit: 200,
          },
        });
        expectOk(res, 'OR union branch');
        expect(Array.isArray(res.data?.tasks)).toBe(true);
        return res;
      };

      // These three reads are NOT a single snapshot: if a task is flagged or its
      // dueDate moves in/out of the window between calls, the hand-computed A∪B can
      // diverge from U and the set-equality below would fail on a snapshot skew rather
      // than a real OR bug. Acceptable here — this suite runs against a single user's
      // DB with no concurrent mutation; the calls are back-to-back (sub-second). If this
      // ever flakes, that's the cause, not the OR implementation.
      const aRes = await fetch(branch1);
      const bRes = await fetch(branch2);
      const uRes = await fetch({ OR: [branch1, branch2] });

      const idSet = (res: any): Set<string> => new Set(res.data.tasks.map((t: any) => t.id as string));
      const aIds = idSet(aRes);
      const bIds = idSet(bRes);
      const uIds = idSet(uRes);

      // (1) No over-matching — every union member satisfies at least one branch.
      // Truncation-immune (checks each returned member against its own fields).
      uRes.data.tasks.forEach((task: any) => {
        const inBranch1 = task.flagged === true;
        const taskDate = task.dueDate?.split('T')[0];
        const inBranch2 = taskDate !== undefined && taskDate >= startStr && taskDate <= endStr;
        expect(inBranch1 || inBranch2).toBe(true);
      });

      // (2) Exact union membership. Two preconditions must hold for the set algebra to be
      // sound; when either fails the *data* (not the code) can't exercise the proof, so we
      // ctx.skip() — an honest "didn't run" — rather than assert (a false red on a non-bug)
      // or fall through (a vacuous green that proves nothing). Skip is the right instrument
      // for a data-environment precondition; assert is for invariants the code must satisfy.

      // Precondition A — no branch truncated at the row limit (a truncated branch yields an
      // incomplete manual union, breaking A∪B).
      const anyTruncated =
        aRes.metadata?.truncated === true || bRes.metadata?.truncated === true || uRes.metadata?.truncated === true;
      if (anyTruncated) {
        ctx.skip(
          'OR-union exact set-equality skipped: a branch truncated at limit 200, so the manual ' +
            'union is incomplete. (The per-member over-match check above still ran.) Narrow the window if persistent.',
        );
        return;
      }

      // Precondition B — branch2 contributes at least one id branch1 lacks. Without a
      // discriminating member, expectedUnion === aIds and a *flattened* result (U === aIds)
      // would satisfy every assertion below: the test would prove nothing. This is a
      // property of the data, not the code, so skip rather than fail.
      const branch2OnlyCount = [...bIds].filter((id) => !aIds.has(id)).length;
      if (branch2OnlyCount === 0) {
        ctx.skip(
          'OR-union test has no discriminating power on this data: branch2 (dueDate window) produced ' +
            'no id absent from branch1 (flagged), so a flatten-to-first regression could not be caught. ' +
            'Widen the window or choose branches whose result sets genuinely differ.',
        );
        return;
      }

      const expectedUnion = new Set<string>([...aIds, ...bIds]);

      // Diagnostics BEFORE the assertions (expect() throws synchronously): on a real
      // mismatch, print exactly which ids are missing/spurious instead of a bare
      // "expected false to be true" with no id — the same diagnostic-first discipline
      // the combined text+date+tag test uses.
      const missingFromUnion = [...expectedUnion].filter((id) => !uIds.has(id));
      const spuriousInUnion = [...uIds].filter((id) => !expectedUnion.has(id));
      if (missingFromUnion.length > 0 || spuriousInUnion.length > 0) {
        console.error('OR-union membership mismatch:', {
          missingFromUnion, // in A∪B but absent from U → OR dropped a branch (the regression)
          spuriousInUnion, // in U but not A∪B → OR over-matched
          sizes: {
            a: aIds.size,
            b: bIds.size,
            u: uIds.size,
            expected: expectedUnion.size,
            branch2Only: branch2OnlyCount,
          },
        });
      }

      // U ⊇ branch1 AND U ⊇ branch2 — THIS is what catches "OR flattens to
      // the first condition" (a flattened result would omit branch2-only ids).
      aIds.forEach((id) => expect(uIds.has(id)).toBe(true));
      bIds.forEach((id) => expect(uIds.has(id)).toBe(true));

      // U ⊆ A ∪ B — no spurious members.
      uIds.forEach((id) => expect(expectedUnion.has(id)).toBe(true));

      // Exact set equality (membership, not just count).
      expect(uIds.size).toBe(expectedUnion.size);
    }, 90000);
  });
});

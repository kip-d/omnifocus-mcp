# OMN-158: Leaf-strict response schemas — full field inventories

**Status:** Approved design (decision record: Kip, 2026-06-11 — §3.2 Option 2 in the OMN-139 design doc) **Ticket:**
[OMN-158](https://linear.app/omnifocus-mcp/issue/OMN-158) **Date:** 2026-06-12 **Parent:**
`docs/superpowers/specs/2026-06-11-omn-139-success-allowlist-design.md`

## 1. Problem

OMN-139 made every script output validate against a top-level closed-world schema, but leaves stayed lenient:
`src/omnifocus/script-response-schemas.ts` carries ~62 `z.unknown()` leaves, plus lenient row objects
(`z.array(z.unknown())`) in the list/envelope factories. Leaf drift — a script emitting a renamed, retyped, or extra
field inside a row or payload — still passes silently. This ticket deepens every family schema to full leaf strictness,
buying the maintenance invariant: **any future change to a script's output shape must touch its schema in lockstep,
enforced loudly at runtime.**

**Zero detection-logic changes.** Detection order, error dialects, and context strings are untouched (that is OMN-159).
The one error-path edit here is presentation only: slimming `invalid_union` issue details (§4, rider 2).

## 2. Inventory methodology (the precision work)

Premise from the parent decision record: **read leaf fields from script source, not from TS types** — types were
unverified hope pre-OMN-139. For each schema:

1. Locate the emitting script's success `JSON.stringify`/`return_` site (each schema's doc comment already cites its
   source anchor — re-verify against current main; OMN-151/154/162 changed some scripts since the comments were
   written).
2. Enumerate every key the script can emit on the success path, including keys produced by helper/serializer functions
   the script calls (e.g. row-building helpers in `src/omnifocus/scripts/shared/helpers.ts` and the AST builders in
   `src/contracts/ast/`).
3. **Optionality rule:** a key is required iff every success branch emits it with a non-`undefined` value.
   `JSON.stringify` drops `undefined`, and many scripts conditionally spread keys — so most leaves are `.optional()`.
   Wrong optionality (required when conditionally absent) is the main false-positive vector.
4. **Type rule:** type each leaf as precisely as the emitter guarantees. Where an emitter can produce heterogeneous
   values (e.g. a field that is a string or `null`), encode the union; never paper over with `z.unknown()` unless the
   value is genuinely passthrough payload (none are expected to remain — see §3 row-object rule for the one principled
   exception).
5. **Conditional/branching emissions** get union schemas with full leaves per branch (the parent audit flagged ~5 such
   sites; OMN-139 already split several — `CompleteResultSchema`, `DeleteResultSchema`, `ProjectWriteResultSchema`. The
   remaining single-object merges are tightened here, §4 riders 3–4).

## 3. Strictness rules (normative)

- `.strict()` on **every** object, all the way down — including row objects inside arrays and nested metadata objects.
- **`.strict()` does not propagate through `z.union`/`discriminatedUnion`** — each branch carries its own `.strict()`
  (memory: zod_strict_propagation_depth). Chain `.strict()` **before** `.refine()`/`.transform()`.
- **Field-projected rows** (task/project rows whose keys depend on the request's `fields` projection, and any serializer
  with caller-selected output): the schema is the **closed set of all projectable field names, each `.optional()`**,
  `.strict()` so an unknown field name still fails. Required-ness cannot be promised for projected fields; closed-world
  key sets can.
- Discriminators stay literals (`z.literal(true)`, `z.literal('created')`) per the parent spec — unchanged.
- Success-branch-only modeling is unchanged: never add `error`-ish keys to a success schema.
- Factories (`listResultSchema`, `astEnvelopeSchema`, `reviewSuccessSchema`) evolve so call sites pass typed row schemas
  instead of getting `z.array(z.unknown())` — this is what retires the `z.ZodTypeAny` returns and with them the ~14
  ESLint `@typescript-eslint/no-unsafe-argument` warnings (rider 6). Module-scope single instantiation is preserved.

## 4. Riders (scope additions from the OMN-139 reviews — Linear comments 2026-06-12)

1. **Mechanical schema↔emission tie-in tests.** The VM mutation tests already execute emitted programs and `JSON.parse`
   real envelopes (e.g. `tests/unit/contracts/ast/mutation/complete.test.ts`). Add
   `expect(<Schema>.safeParse(parsed).success).toBe(true)` per success-path test (and assert the issues array on failure
   for diagnosability). This protects against emission drift mechanically — a **different** protection than
   leaf-strictness; both land.
2. **TagMutation fail-closed detail slimming:** at the `executeJson` fail-closed site, slim `invalid_union`
   `unionErrors` to the branch whose `action` (or other literal) discriminator matched, so rejection details point at
   the real mismatch instead of listing every branch. Presentation-only.
3. **`TaskWriteResultSchema` → create∪update union** (currently single object + `.refine`; the refine shape admits
   create/update key hybrids). Mirror `ProjectWriteResultSchema`'s two-variant union.
4. **`ExportResultSchema` → per-format union** (currently one merged object; a csv result carrying `debug` passes). One
   strict variant per format×script branch, per the source-verified inventory already in its doc comment.
5. **Comment fix** in `script-response-schemas.ts` (~reparent comment): the to-root variant omits keys via a separate
   envelope literal at build time, NOT `JSON.stringify` undefined-dropping (that mechanism belongs to merge's
   `warning`).
6. **ESLint cleanup falls out:** typed factory returns eliminate the ~14 `no-unsafe-argument` warnings (the
   `listResultSchema` `ZodTypeAny` return + the five `as z.ZodTypeAny` analyze casts). Verify warning count drops; do
   not suppress any remaining ones.

## 5. Testing

| Layer                   | Cases                                                                                                                                                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit — schema fixtures  | Per schema: representative full payload passes; minimal payload (only required keys) passes; row with an unexpected leaf key fails; row with a wrong-typed leaf fails; each union branch validated independently. Extend `tests/unit/omnifocus/script-response-schemas.test.ts`. |
| Unit — tie-in (rider 1) | VM mutation success-path tests assert `safeParse` against the matching schema. Mutation-verify: drop a key from one emitter → tie-in test must fail → restore.                                                                                                                   |
| Unit — existing         | Tool tests that mock `executeJson` with fixture payloads must still pass — fixture payloads that no real script emits get corrected to wire shapes, not loosened schemas.                                                                                                        |
| Integration             | Full live suite (`npm run test:integration`, run_in_background, npm not bun, never kill — OMN-143). The real gate against wrong optionality breaking a working read.                                                                                                             |
| Conformance             | `npm run conformance` vs a SAME-DAY main control run (recorded baselines drifted — OMN-168); llama3.1:8b + qwen2.5:7b; expect qwen ~84% parity, not the stale baseline.                                                                                                          |

False positives are diagnosable via the raw-output-in-details (2000 chars) on every rejection; a wrong schema is a
one-line fix. A loud false positive is recoverable; a silent false negative is invisible.

## 6. Risks

| Risk                                                                        | Mitigation                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong optionality converts a working read into a loud failure               | Optionality rule §2.3 (conditional emission ⇒ optional); full integration suite; 2000-char raw output in rejection details.                                                                                                                 |
| Schema doc-comment source anchors are stale (scripts changed since OMN-139) | Methodology step 1 re-verifies every anchor against current main before inventorying.                                                                                                                                                       |
| Field-projected rows have unbounded key sets                                | They don't — projections come from finite field enums in the compilers; the schema enumerates the enum. If an implementer finds a genuinely open key set, that site escalates to the controller rather than silently keeping `z.unknown()`. |
| Tie-in tests pass vacuously (parse a fixture, not a real emission)          | Tie-in asserts run on the SAME parsed object the VM test already executes; reviewer applies the "driven the way the real caller drives it" rule + mutation-verify.                                                                          |

## 7. Non-goals

- Detection-order or error-vocabulary changes (OMN-159).
- Success-shape unification across families (OMN-160).
- New schemas for seams outside `executeJson` (`executeViaUrlScheme`, `executeBatch` — out of scope per parent).

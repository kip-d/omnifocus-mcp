export const meta = {
  name: 'review-verify',
  description:
    'Cheap review with disinterested adjudication: N finders over a diff, then blind scorers that never learn who found what',
  whenToUse:
    'Slice-stage or task-level review where a full /code-review fan-out is disproportionate, but you still want findings adjudicated by someone other than the author. NOT a substitute for the merge gate.',
  phases: [
    { title: 'Find', detail: 'independent finders over the same diff, one lens each' },
    { title: 'Verify', detail: 'blind scorers rate each finding 0-100 with no author context' },
  ],
};

// WHY THIS EXISTS
//
// The property that makes the builtin /code-review trustworthy is not breadth for
// its own sake -- it is that findings are scored by a DISINTERESTED party before
// anyone acts on them. A single reviewer subagent returns findings unscored, so the
// coordinator adjudicates. The coordinator wrote the code. That is the author
// judging claims about their own work, under "just address the finding" pressure --
// the conditions that produced OMN-267's round 2, where 100% of findings were
// introduced by round 1's own fixes.
//
// This workflow buys that one property at ~2-4 agents instead of the gate's 6-9
// (measured ~400-550k subagent tokens per gate round), which makes it affordable at
// per-task altitude. It is a MIDDLE RUNG, not a gate replacement: fewer lenses, no
// whole-branch context, no git history sweep.
//
// The blinding is the load-bearing detail. Scorers receive the finding and the diff
// and nothing else -- no finder identity, no confidence claim, no sibling findings,
// no implementer rationale. A scorer that knows "the correctness finder flagged
// this" inherits that finder's confidence and stops being independent.
//
// args: { base, head, files?, context?, finderModel?, scorerModel?, lenses? }
//   base/head    - git range to review (required)
//   context      - optional task spec / plan / PR description for spec-conformance
//   finderModel  - default 'sonnet' (tier is a judgment call; state it deliberately)
//   scorerModel  - default 'sonnet'
//   lenses       - override the default lens set

// args can arrive as an object or as a JSON string depending on how the caller
// passes it; a stringified payload silently yields undefined on every field.
const a = typeof args === 'string' ? JSON.parse(args) : args || {};
if (!a.base || !a.head) throw new Error('review-verify: args.base and args.head are required');

// MEASURED DEFAULTS (first real run, 2026-07-26, PR #216 @ b28e7bc5 -- see the
// notes at the bottom of this file):
//   finders on sonnet raised every defect the gate's round 1 found.
//   scorers on sonnet FALSE-REFUTED two of six real defects, including a fatal one.
// So: cheap finders, expensive verifiers. Overriding scorerModel down is a
// deliberate accuracy trade, not a free saving.
const FINDER_MODEL = a.finderModel || 'sonnet';
const SCORER_MODEL = a.scorerModel || 'opus';

// Cost guard. The verify stage is bounded by how many claims the finders emit, not
// by the diff, so it can run away without a cap. First run: 12 findings -> 12
// scorers -> 819k subagent tokens, worse than the full gate it was meant to undercut.
const MAX_SCORED = a.maxScored || 12;

const DEFAULT_LENSES = [
  {
    key: 'correctness',
    brief:
      'Runtime correctness. Wrong API signatures, impossible calls, unguarded property reads, off-by-one, ' +
      'mishandled null/undefined, control flow that cannot reach its intended state, resource leaks, missing timeouts. ' +
      'Ask of every external API call: does this signature actually exist, and would the first invocation throw?',
  },
  {
    key: 'contract',
    brief:
      'Contract and convention adherence. Read the repo CLAUDE.md files that govern the changed paths and check the diff ' +
      'against them specifically. Flag a convention violation ONLY if you can quote the line of CLAUDE.md it violates.',
  },
  {
    key: 'tests',
    brief:
      'Test integrity. The repo defect class is vacuous-green and wrong-seam tests. For each test: would it FAIL if the ' +
      'behavior it names broke, and is the code driven exactly the way the real upstream caller drives it (stdin/argv/env, ' +
      'real state)? Also flag behavior the diff introduces that no test exercises at all.',
  },
  {
    key: 'idempotence',
    brief:
      'Repeat-execution and side-effect safety. What happens on the second run, on import, on partial failure? Flag ' +
      'operations that duplicate state, mutate on module load, or leave the system half-changed with no way to resume.',
  },
];

const LENSES = a.lenses || DEFAULT_LENSES;

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'file', 'evidence', 'consequence'],
        properties: {
          title: { type: 'string', description: 'One-line statement of the defect' },
          file: { type: 'string' },
          line: { type: 'integer' },
          evidence: { type: 'string', description: 'The specific code that is wrong, quoted' },
          consequence: { type: 'string', description: 'Concrete failure: inputs/state -> wrong result' },
        },
      },
    },
  },
};

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'reasoning'],
  properties: {
    score: {
      type: 'integer',
      minimum: 0,
      maximum: 100,
      description:
        '0 certainly false positive, 25 unverifiable, 50 real but minor, 75 real and should fix, 100 certainly real and important',
    },
    reasoning: { type: 'string' },
    verified_by: {
      type: 'string',
      description: 'What you actually did to check: file read, signature traced, control flow followed',
    },
  },
};

const rangeBlock = `
## Git range

Base: ${a.base}
Head: ${a.head}

Read the diff yourself:
\`\`\`bash
git diff --stat ${a.base}..${a.head}
git diff ${a.base}..${a.head}
\`\`\`
${a.files ? `\nChanged files of interest: ${a.files}\n` : ''}
${a.context ? `\n## What this change is meant to do\n\n${a.context}\n` : ''}`;

log(
  `review-verify: ${LENSES.length} finders (${FINDER_MODEL}) -> blind scorers (${SCORER_MODEL}) over ${a.base}..${a.head}`,
);

// A BARRIER is correct here, despite pipeline() being the usual default: dedup needs
// every finding at once. Lens-scoped finders GUARANTEE overlap on cross-cutting
// defects -- the first run had one idempotence defect raised by three lenses and
// adjudicated three separate times, at full context each. Dedup before verify is
// where that waste has to be removed.
const raw = await parallel(
  LENSES.map(
    (lens) => () =>
      agent(
        `You are a code reviewer working ONE lens only: **${lens.key}**.

${lens.brief}
${rangeBlock}

## Rules

- Report ONLY defects in your lens. Another reviewer covers every other angle; duplicating their work costs you nothing and gains nothing.
- Read the actual files. Do not infer from the diff hunk alone when the surrounding code decides the answer.
- Every finding needs quoted evidence and a concrete consequence. "Could be clearer" is not a finding.
- Zero findings is a legitimate result. Do not pad.
- Do not fix anything. Do not modify the working tree. Report only.`,
        { label: `find:${lens.key}`, phase: 'Find', model: FINDER_MODEL, schema: FINDINGS_SCHEMA },
      ).then((r) => ({ lens: lens.key, findings: r?.findings || [] })),
  ),
);

// Dedup on file + normalized title shape. Two lenses describing the same defect in
// different words still collide on the file plus the salient identifiers, which is
// good enough to halve the verify bill without merging genuinely distinct claims.
const seen = new Map();
for (const r of raw.filter(Boolean)) {
  for (const f of r.findings) {
    const key = `${f.file}::${(f.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .sort()
      .slice(0, 6)
      .join('-')}`;
    const prior = seen.get(key);
    if (prior) {
      prior.lenses.push(r.lens);
    } else {
      seen.set(key, { ...f, lens: r.lens, lenses: [r.lens] });
    }
  }
}
const unique = [...seen.values()];
const toScore = unique.slice(0, MAX_SCORED);
const dropped = unique.length - toScore.length;
log(
  `review-verify: ${raw.filter(Boolean).reduce((n, r) => n + r.findings.length, 0)} raw -> ${unique.length} unique` +
    (dropped > 0 ? ` -> scoring ${toScore.length}, DROPPED ${dropped} unscored (maxScored=${MAX_SCORED})` : ''),
);

// Blind adjudication. Each finding is scored with NO finder identity, NO lens name,
// NO sibling findings, and NO author rationale -- only the claim and the code. This
// is the property the whole workflow exists to buy.
const scored = (
  await parallel(
    toScore.map(
      (f) => () =>
        agent(
          `Independently determine whether this claimed defect is real. You did not find it and you do not know who did. Judge the claim against the code, nothing else.

## The claim

${f.title}

File: ${f.file}${f.line ? `:${f.line}` : ''}

Evidence offered:
${f.evidence}

Consequence claimed:
${f.consequence}
${rangeBlock}

## How to score

Verify against the actual code before scoring. Read the file. If it claims an API signature is wrong, find the real signature. If it claims control flow cannot reach a state, trace it.

- 0    Certainly a false positive. The code does not do what the claim says.
- 25   Unverifiable from what you can see. Might be real; you could not confirm it.
- 50   Real, but minor or rare in practice relative to the rest of the change.
- 75   Real and should be fixed before merge.
- 100  Certainly real and important. It breaks, loses data, or ships a wrong result.

Default toward the LOWER score when torn. A false confirmation costs a real fix cycle chasing a phantom; a missed minor finding costs little. State in verified_by what you actually did to check -- "read the file and traced the call" or "could not verify without running it", not "reviewed the claim".`,
          { label: `verify:${f.file.split('/').pop()}`, phase: 'Verify', model: SCORER_MODEL, schema: VERDICT_SCHEMA },
        ).then((v) => ({ ...f, score: v?.score ?? null, reasoning: v?.reasoning, verified_by: v?.verified_by })),
    ),
  )
).filter(Boolean);

const confirmed = scored.filter((f) => (f.score ?? 0) >= 50).sort((x, y) => y.score - x.score);
const rejected = scored.filter((f) => (f.score ?? 0) < 50);

log(`review-verify: ${scored.length} scored, ${confirmed.length} confirmed (>=50), ${rejected.length} rejected`);

return {
  range: { base: a.base, head: a.head },
  models: { finder: FINDER_MODEL, scorer: SCORER_MODEL },
  lenses: LENSES.map((l) => l.key),
  counts: {
    raw: raw.filter(Boolean).reduce((n, r) => n + r.findings.length, 0),
    unique: unique.length,
    scored: scored.length,
    unscored_dropped: dropped,
    confirmed: confirmed.length,
    rejected: rejected.length,
  },
  confirmed,
  rejected,
  // Findings that never got adjudicated because of MAX_SCORED. Surfaced, never
  // silently truncated -- an unmentioned cap reads as "we covered everything".
  unscored: unique.slice(MAX_SCORED),
};

// ---------------------------------------------------------------------------
// FIRST-RUN MEASUREMENTS (2026-07-26, PR #216 @ f0df756d..b28e7bc5, 351-line diff)
//
// Ran as 4 sonnet finders + 12 sonnet scorers, BEFORE the dedup and model changes
// above. Results, and what each one changed:
//
//   Recall:  raised all 6 defects the gate's round 1 found, vs 1 of 6 for a single
//            Superpowers-template reviewer on OPUS. Fan-out wins on surfacing --
//            but see the contamination caveat below before trusting the number.
//
//   Verify:  sonnet scorers FALSE-REFUTED 2 of the 6 real defects (a fatal
//            Task-in-Folder parent error scored 25; a Tag constructor arity error
//            scored 10). Net delivered 4 of 6 -- the verify stage destroyed a third
//            of the value it was adjudicating. Hence SCORER_MODEL defaults to opus.
//
//   Cost:    16 agents, 819,856 subagent tokens, 259s -- WORSE than the full gate's
//            measured 400-550k. Cause: no dedup (one defect adjudicated 3x) and one
//            full-context scorer per finding. Hence the dedup barrier and MAX_SCORED.
//
//   CAVEAT:  that run was contaminated. The subject was a historical commit whose
//            fixes live in the repo's own later history, and 2 of 4 finders plus 6
//            of 12 scorers found commit 6524e731 ("address all 6 /code-review
//            findings") and cited it as corroboration. To re-measure honestly, make
//            future history UNREACHABLE (shallow clone pinned to the SHA) rather
//            than merely asking agents not to look. The false-REFUTE result above
//            survives regardless: leakage biases toward confirming, so a rejection
//            despite it is robust.
// ---------------------------------------------------------------------------

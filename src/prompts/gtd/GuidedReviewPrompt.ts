import { PromptMessage } from '@modelcontextprotocol/sdk/types.js';
import { BasePrompt, PromptArgument } from '../base.js';

/**
 * OMN-313 — guided review: "N decisions, one at a time" over the detectors
 * that already exist. Mirrors docs/skills/omnifocus-assistant/references/
 * workflow-guided-review.md (canonical). Externalize salience, not agency:
 * the server scans + evidences, this prompt presents, the user judges.
 */
export const REVIEW_MODES = ['quick', 'standard', 'deep'] as const;
export type ReviewMode = (typeof REVIEW_MODES)[number];

// Order is the presentation order. `on_hold_projects` and `productivity_check`
// are read/analyze calls, not pattern_analysis detectors — see NON_DETECTOR_QUEUES.
export const QUEUES_BY_MODE: Record<ReviewMode, readonly string[]> = {
  quick: ['missing_next_actions', 'deadline_health', 'waiting_for'],
  standard: [
    'missing_next_actions',
    'deadline_health',
    'waiting_for',
    'dormant_projects',
    'on_hold_projects',
    'wip_limits',
  ],
  deep: [
    'missing_next_actions',
    'deadline_health',
    'waiting_for',
    'dormant_projects',
    'on_hold_projects',
    'wip_limits',
    'clarify_candidates',
    'review_gaps',
    'productivity_check',
  ],
};

// An OUTPUT vocabulary — the choices the user can make after judging an item.
// Not a text screen: nothing in this workflow scans task names or notes for
// words (the OMN-258 verb-whitelist screen is a different, demoted thing).
export const DECISION_OUTCOMES = ['define', 'hold', 'handoff', 'drop', 'done', 'skip'] as const;

const NON_DETECTOR_QUEUES = new Set(['on_hold_projects', 'productivity_check']);

function describeRaw(raw: unknown): string {
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw) : typeof raw;
}

function parseMode(raw: unknown): ReviewMode {
  const mode = raw === undefined || raw === null || raw === '' ? 'quick' : describeRaw(raw);
  if (!(REVIEW_MODES as readonly string[]).includes(mode)) {
    throw new Error(`guided_review: mode must be one of quick, standard, deep (got ${describeRaw(raw)})`);
  }
  return mode as ReviewMode;
}

function describePopulation(mode: ReviewMode): string {
  if (mode === 'quick') {
    return "Only items whose project appears in list_for_review's data.projects[] with reviewStatus overdue or due_today. If that slice is empty, say so and offer standard.";
  }
  if (mode === 'standard') {
    return 'All active and on-hold projects.';
  }
  return 'The whole database.';
}

export class GuidedReviewPrompt extends BasePrompt {
  name = 'guided_review';
  description =
    'Guided review, one decision at a time: fetch the decision queues (existing detectors), present each item with its ' +
    'surfacing reason quoted from the evidence, ask for one outcome, apply it, log it. Modes: quick | standard | deep.';

  arguments: PromptArgument[] = [
    {
      name: 'mode',
      description: "quick (default, 10–15 min, today's review slice) | standard | deep",
      required: false,
    },
  ];

  generateMessages(args: Record<string, unknown>): PromptMessage[] {
    const mode = parseMode(args.mode);
    const queues = QUEUES_BY_MODE[mode];
    const detectors = queues.filter((q) => !NON_DETECTOR_QUEUES.has(q));

    const population = describePopulation(mode);

    const extraCalls = [
      queues.includes('on_hold_projects')
        ? 'on_hold_projects = omnifocus_read({ query: { type: "projects", filters: { status: "on_hold" } } }).'
        : '',
      queues.includes('productivity_check')
        ? 'productivity_check = omnifocus_analyze({ analysis: { type: "productivity_stats", params: { groupBy: "week" } } }) — read, do not act.'
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    return [
      {
        role: 'user',
        content: { type: 'text', text: `Run a guided review. Mode: ${mode}. One decision at a time.` },
      },
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: `## Guided review — Mode: ${mode}

### Step 1 — fetch the queues (two calls, never a per-project fan-out)
\`\`\`
omnifocus_analyze({ analysis: { type: "manage_reviews", params: { operation: "list_for_review" } } })
omnifocus_analyze({ analysis: { type: "pattern_analysis", params: { insights: ${JSON.stringify(detectors)} } } })
\`\`\`
Queue order: ${queues.join(' → ')}.
Population: ${population}
${extraCalls}

### Step 2 — the loop, one item per turn
1. State the item and its reason QUOTED from the evidence bundle (counts, dates). Never an inferred motive.
2. Ask for one decision outcome from this fixed set — an output vocabulary, not a text screen; nothing here scans task text:
   ${DECISION_OUTCOMES.map((o) => `\`${o}\``).join(' · ')}
   define → create the next action · hold → status on_hold (+ date) · handoff → propose the handoff list, apply after the user edits it · drop → status dropped · done → complete · skip → no write, log it.
3. Embed the confirmation in the question ("Put this on hold until Sept 15?"), then apply the write.
4. Append one line to the vault file GTD/Review Log.md: \`YYYY-MM-DD | ${mode} | <name> (project|task) | <queue> | <outcome>\` — names, never omnifocus:/// URIs; the outcome only.
After a project-level queue, mark the touched projects reviewed in ONE manage_reviews mark_reviewed call with projectIds[]; check data.batch.results.failed.

Do not show a scoreboard of everything open. Show the remaining count only if asked.`,
        },
      },
      {
        role: 'user',
        content: { type: 'text', text: 'Fetch the queues and start with the first item.' },
      },
    ];
  }
}

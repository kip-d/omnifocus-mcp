/**
 * clarify_candidates screen (OMN-258, replaces the next_actions verdict detector).
 *
 * Contract: screen → evidence-bundle → model-judges. This module runs the cheap
 * server-side LEXICAL SCREEN (recall-oriented — a wide net is fine, precision is
 * the calling model's job) and assembles the per-candidate evidence bundle the
 * caller needs to judge task clarity: id, name, note head, placement, tags,
 * estimate, dates, children. It never issues verdicts: no scores, no canned
 * rewrite suggestions. Field names say candidate/screen, never vague/verdict.
 */

export interface CandidateTaskInput {
  id: string;
  name: string;
  completed: boolean;
  noteHead?: string;
  project?: string;
  projectId?: string;
  tags: string[];
  estimatedMinutes: number | null;
  deferDate?: string;
  dueDate?: string;
  children: number;
}

export type ScreenReason = 'no_action_verb' | 'vague_keyword' | 'single_word';

export interface ClarifyCandidate {
  id: string;
  name: string;
  /** Why the lexical screen surfaced this task — recall-oriented, not a verdict. */
  screen_reasons: ScreenReason[];
  /** First ~160 chars of the note (the scan's noteHead); full note via omnifocus_read by id. */
  note_head: string | null;
  /** Vague name AND empty note is a stronger clarify-flag than the name alone. */
  note_empty: boolean;
  /** True when note_head hit the scan's 160-char head limit — the full note is longer; fetch it by id. */
  note_head_at_limit: boolean;
  project: string | null;
  project_id: string | null;
  folder_path: string | null;
  tags: string[];
  estimated_minutes: number | null;
  defer_date: string | null;
  due_date: string | null;
  has_children: boolean;
}

export interface ClarifyCandidatesResult {
  /** Incomplete tasks the screen actually examined. */
  screened_total: number;
  candidates_total: number;
  candidates_returned: number;
  candidates_capped: boolean;
  candidate_cap: number;
  candidates: ClarifyCandidate[];
}

/** Bundle cap — the whole-DB name+note dump is impossible by construction. */
export const CLARIFY_CANDIDATE_CAP = 25;

/** The scan's noteHead substring length (fetchSlimmedData); used for the at-limit flag. */
const NOTE_HEAD_LIMIT = 160;

const ACTION_VERBS = [
  'call',
  'email',
  'write',
  'review',
  'send',
  'update',
  'create',
  'fix',
  'test',
  'deploy',
  'schedule',
  'research',
  'draft',
  'finalize',
  'submit',
  'prepare',
  'organize',
  'order',
  'buy',
  'read',
  'watch',
  'listen',
  'practice',
  'clean',
  'file',
  'backup',
  'install',
  'configure',
];

const VAGUE_KEYWORDS = ['stuff', 'things', 'maybe', 'ideas', 'misc', 'miscellaneous', 'various', 'etc', 'tbd', 'todo'];

/** Lexical screen: which recall-oriented signals fire on this name? */
function screenReasons(name: string): ScreenReason[] {
  const reasons: ScreenReason[] = [];
  const lowerName = name.toLowerCase();
  const words = lowerName.split(/\s+/).filter(Boolean);

  if (!ACTION_VERBS.some((verb) => lowerName.startsWith(verb))) {
    reasons.push('no_action_verb');
  }
  if (VAGUE_KEYWORDS.some((keyword) => lowerName.includes(keyword))) {
    reasons.push('vague_keyword');
  }
  if (words.length === 1) {
    reasons.push('single_word');
  }
  return reasons;
}

/**
 * Screen incomplete tasks and build capped evidence bundles.
 *
 * A task is a candidate when its NAME alone fails the lexical screen — no
 * leading action verb, a vague keyword, or a single word. A name that starts
 * with an action verb and trips no other signal passes, whatever its length.
 * The note is deliberately NOT screened: "clear only via note" is legitimate
 * (notes carry support material by convention) — the note ships as evidence
 * for the caller's judgment instead.
 *
 * @param projectFolderById projectId → folder path, for placement context.
 */
export function screenClarifyCandidates(
  tasks: CandidateTaskInput[],
  projectFolderById: ReadonlyMap<string, string | null>,
): ClarifyCandidatesResult {
  const incomplete = tasks.filter((t) => !t.completed);

  const candidates: ClarifyCandidate[] = [];
  for (const task of incomplete) {
    const reasons = screenReasons(task.name);
    // no_action_verb alone on a multi-word name is too weak a signal even for
    // a recall-oriented screen (it would surface most of the database); it
    // needs a co-signal (vague keyword or single word) OR the name must lack
    // a verb AND the note be empty — the ticket's "vague name AND empty note"
    // compound flag.
    const noteEmpty = !task.noteHead || task.noteHead.trim() === '';
    const isCandidate =
      reasons.includes('vague_keyword') ||
      reasons.includes('single_word') ||
      (reasons.includes('no_action_verb') && noteEmpty);
    if (!isCandidate) continue;

    candidates.push({
      id: task.id,
      name: task.name,
      screen_reasons: reasons,
      note_head: task.noteHead ?? null,
      note_empty: noteEmpty,
      note_head_at_limit: (task.noteHead?.length ?? 0) >= NOTE_HEAD_LIMIT,
      project: task.project ?? null,
      project_id: task.projectId ?? null,
      folder_path: task.projectId ? (projectFolderById.get(task.projectId) ?? null) : null,
      tags: task.tags,
      estimated_minutes: task.estimatedMinutes,
      defer_date: task.deferDate ?? null,
      due_date: task.dueDate ?? null,
      has_children: task.children > 0,
    });
  }

  // Strongest clarify-flags first: empty-note candidates lead, then stable by name.
  candidates.sort((a, b) => {
    if (a.note_empty !== b.note_empty) return a.note_empty ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const capped = candidates.length > CLARIFY_CANDIDATE_CAP;
  const returned = capped ? candidates.slice(0, CLARIFY_CANDIDATE_CAP) : candidates;

  return {
    screened_total: incomplete.length,
    candidates_total: candidates.length,
    candidates_returned: returned.length,
    candidates_capped: capped,
    candidate_cap: CLARIFY_CANDIDATE_CAP,
    candidates: returned,
  };
}

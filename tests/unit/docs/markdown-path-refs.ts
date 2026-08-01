/**
 * Shared path-reference extraction for the documentation guards.
 *
 * Two suites consume this: claude-md-paths.test.ts (repo-root CLAUDE.md, `src/` and
 * `docs/` prefixes) and skill-reference-paths.test.ts (docs/skills/**, `references/`
 * and `docs/` prefixes). They previously carried near-identical private copies that
 * had already diverged on the path-token regex, so a fix to one silently left the
 * other behind.
 */

/**
 * Extract path-like tokens carrying one of `prefixes` from inline code, fenced code,
 * and markdown link targets only — never bare prose, which false-positives on
 * sentences that merely discuss a filename.
 */
export function extractRefs(markdown: string, prefixes: string[]): string[] {
  const spans: string[] = [];
  // Fenced blocks first, then removed so the inline pass doesn't re-scan them.
  const rest = markdown.replace(/```[\s\S]*?```/g, (m) => {
    spans.push(m);
    return '';
  });
  for (const m of rest.matchAll(/`[^`\n]+`/g)) spans.push(m[0]);
  // Markdown link targets: take the (...) target string FIRST, then tokenize.
  for (const m of markdown.matchAll(/\]\(([^)]+)\)/g)) spans.push(m[1]);

  // Anchored at a path-token boundary so a mid-path `docs/` cannot partial-match.
  // Zero-or-more after the slash, so a bare directory mention (`references/`) counts.
  const pattern = new RegExp(String.raw`(?<=^|[\s\`([\]])\/?(?:${prefixes.join('|')})\/[^\s\`)]*`, 'g');
  const refs: string[] = [];
  for (const span of spans) {
    for (const m of span.matchAll(pattern)) refs.push(m[0]);
  }
  return refs;
}

/**
 * Strip leading '/', a `#fragment`, a trailing :NN[:CC], and trailing sentence
 * punctuation. Anchors are stripped because `file.md#section` is a valid link whose
 * on-disk target is `file.md` — leaving the fragment on would classify it malformed.
 */
export function normalizeRef(token: string): string {
  return token
    .replace(/^\//, '') // leading '/' => repo-root
    .replace(/#.*$/, '') // '#anchor' => the file itself
    .replace(/:\d+(?::\d+)?$/, '') // strip :NN or :NN:CC
    .replace(/[.,);:]+$/, ''); // strip trailing sentence punctuation
}

/** 'dir' | 'file' | 'malformed' */
export function classifyRef(norm: string, allowedExt: RegExp): 'dir' | 'file' | 'malformed' {
  if (norm.endsWith('/')) return 'dir';
  if (allowedExt.test(norm)) return 'file';
  return 'malformed';
}

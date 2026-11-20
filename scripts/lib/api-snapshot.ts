/**
 * Pure helpers for scripts/regen-api-snapshot.ts (OMN-328): optional-before-required
 * normalization, snapshot header assembly, and the token-stream member differ.
 * No I/O here, so tests/unit/scripts/api-snapshot.test.ts can pin each piece.
 */

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/** Split `text` on top-level commas, respecting (), [], {} and generics (`=>` is not a closing angle). */
export function splitTopLevelParams(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{' || ch === '<') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === '>' && text[i - 1] !== '=') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') parts.push(current);
  return parts;
}

const OPTIONAL_PARAM = /^(\s*)(\w+)\?(\s*:)/;
const REST_PARAM = /^\s*\.\.\./;

/** Strip `?` from each optional parameter that precedes a required one (TS1016). */
export function normalizeParamList(paramText: string): string {
  const params = splitTopLevelParams(paramText);
  let lastRequired = -1;
  params.forEach((p, i) => {
    if (!OPTIONAL_PARAM.test(p) && !REST_PARAM.test(p)) lastRequired = i;
  });
  return params.map((p, i) => normalizeText(i < lastRequired ? p.replace(OPTIONAL_PARAM, '$1$2$3') : p)).join(',');
}

/** Normalize every parenthesized parameter list in one line of code, recursing into function-typed parameters. */
function normalizeCode(code: string): string {
  let out = '';
  let i = 0;
  while (i < code.length) {
    if (code[i] !== '(') {
      out += code[i];
      i++;
      continue;
    }
    let depth = 0;
    let j = i;
    for (; j < code.length; j++) {
      if (code[j] === '(') depth++;
      else if (code[j] === ')' && --depth === 0) break;
    }
    if (j >= code.length) {
      out += code.slice(i);
      break;
    }
    out += `(${normalizeParamList(code.slice(i + 1, j))})`;
    i = j + 1;
  }
  return out;
}

/**
 * Normalize optional-before-required parameters across a whole export. Operates per line and leaves
 * `//` comments untouched; the export keeps each signature on one line.
 */
export function normalizeText(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const at = line.indexOf('//');
      if (at === -1) return normalizeCode(line);
      return normalizeCode(line.slice(0, at)) + line.slice(at);
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export interface ExportInfo {
  /** Version token from the export's first line, e.g. `4.10.1`. */
  version: string;
  /** Full first line of the export. */
  firstLine: string;
}

const FIRST_LINE = /^\/\/ TypeScript definitions for OmniFocus (\S+) \(/;

/** Dotted numeric versions only; anything else would make compareVersions return NaN. */
const VERSION_RE = /^\d+(\.\d+)*$/;

export function parseExportInfo(raw: string): ExportInfo {
  const firstLine = raw.split('\n', 1)[0] ?? '';
  const m = FIRST_LINE.exec(firstLine);
  if (!m?.[1]) throw new Error(`Unrecognized export: first line is ${JSON.stringify(firstLine.slice(0, 120))}`);
  if (!VERSION_RE.test(m[1])) {
    throw new Error(
      `Unsupported OmniFocus version ${JSON.stringify(m[1])}: expected dotted numeric (e.g. 4.10.1). ` +
        "For a beta or pre-release build, hand-fix the version on the export's first line and pass the file with --from.",
    );
  }
  return { version: m[1], firstLine };
}

const HEADER_BLOCK = [
  '//',
  '// Generated via: scripts/regen-api-snapshot.ts (app.getTypeScriptDeclarations() over the JXA bridge),',
  '// then optional-before-required parameters normalized and formatted with prettier',
  '// See src/omnifocus/api/README.md for regeneration instructions',
  '//',
];

/** Insert the regen-instructions block after the export's two-line banner (version line, timestamp line). */
export function addHeader(raw: string): string {
  const lines = raw.split('\n');
  return [...lines.slice(0, 2), ...HEADER_BLOCK, ...lines.slice(2)].join('\n');
}

// ---------------------------------------------------------------------------
// Differ
// ---------------------------------------------------------------------------

export interface Member {
  container: string;
  text: string;
}

/**
 * Token-stream member extraction: strip comments, collapse whitespace, keep `?` markers (optional/required flips are real
 * drift), ignore wrapping, then split on `;` `{` `}` tracking a container stack. Insensitive to indentation,
 * line wrapping and prettier formatting.
 */
export function extractMembers(source: string): Member[] {
  let t = source.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ');
  t = t.replace(/constructor \(/g, 'constructor(');
  t = t
    .replace(/\(\s+/g, '(')
    .replace(/,\s*\)/g, ')')
    .replace(/\s+\)/g, ')');
  const out: Member[] = [];
  const stack: string[] = [];
  let buf = '';
  const push = (text: string) => out.push({ container: stack.join('.'), text });
  for (const ch of t) {
    if (ch === '{') {
      const name = /(?:class|namespace|interface|enum)\s+([\w.]+)/.exec(buf)?.[1] ?? '?';
      stack.push(name);
      push(`<type> ${buf.trim()}`);
      buf = '';
    } else if (ch === '}') {
      if (buf.trim()) push(buf.trim());
      stack.pop();
      buf = '';
    } else if (ch === ';') {
      push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  return out;
}

export interface SnapshotDiff {
  beforeCount: number;
  afterCount: number;
  added: Member[];
  removed: Member[];
  addedContainers: string[];
  removedContainers: string[];
}

const keyOf = (m: Member) => `${m.container}\u0000${m.text}`;

export function diffSnapshots(before: string, after: string): SnapshotDiff {
  const a = new Map(extractMembers(before).map((m) => [keyOf(m), m]));
  const b = new Map(extractMembers(after).map((m) => [keyOf(m), m]));
  const removed = [...a].filter(([k]) => !b.has(k)).map(([, m]) => m);
  const added = [...b].filter(([k]) => !a.has(k)).map(([, m]) => m);
  const containers = (map: Map<string, Member>) => new Set([...map.values()].map((m) => m.container));
  const ca = containers(a);
  const cb = containers(b);
  return {
    beforeCount: a.size,
    afterCount: b.size,
    added,
    removed,
    addedContainers: [...cb].filter((c) => !ca.has(c)).sort(),
    removedContainers: [...ca].filter((c) => !cb.has(c)).sort(),
  };
}

export function formatDiff(beforeLabel: string, afterLabel: string, d: SnapshotDiff): string {
  const lines = [`${beforeLabel} -> ${afterLabel}: ${d.beforeCount} -> ${d.afterCount} members`];
  if (d.added.length === 0 && d.removed.length === 0) {
    lines.push('No member changes.');
    return lines.join('\n');
  }
  const where = (c: string) => c || '(top level)';
  for (const c of d.addedContainers) lines.push(`+ container ${where(c)}`);
  for (const c of d.removedContainers) lines.push(`- container ${where(c)}`);
  const sorted = (ms: Member[]) => [...ms].sort((x, y) => keyOf(x).localeCompare(keyOf(y)));
  for (const m of sorted(d.removed)) lines.push(`- ${where(m.container)}: ${m.text}`);
  for (const m of sorted(d.added)) lines.push(`+ ${where(m.container)}: ${m.text}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Versions and retention
// ---------------------------------------------------------------------------

/** Compare dotted version strings numerically (4.10.1 > 4.9). */
export function compareVersions(a: string, b: string): number {
  for (const v of [a, b]) {
    if (!VERSION_RE.test(v)) throw new Error(`Cannot compare non-numeric version ${JSON.stringify(v)}`);
  }
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Snapshot versions to delete: keep `newVersion` and `previous`, delete only versions strictly older than
 * `previous`. A newer version is never selected, so regenerating from an older app cannot destroy a newer
 * snapshot. With no `previous`, nothing is deleted.
 */
export function selectRetentionDeletions(
  versions: string[],
  newVersion: string,
  previous: string | undefined,
): string[] {
  if (previous === undefined) return [];
  return versions.filter((v) => v !== newVersion && v !== previous && compareVersions(v, previous) < 0);
}

/**
 * Pick the snapshot to diff against: the version the symlink targets (when known and not the version being
 * regenerated), else the highest other snapshot. `linked` is undefined when the symlink is missing, is not a
 * symlink (core.symlinks=false checkouts, archives), or names an unparseable target.
 */
export function selectPreviousVersion(
  linked: string | undefined,
  otherVersions: string[],
  newVersion: string,
): string | undefined {
  if (linked && linked !== newVersion) return linked;
  return [...otherVersions]
    .filter((v) => v !== newVersion)
    .sort(compareVersions)
    .pop();
}

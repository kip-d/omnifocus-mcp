/**
 * Test helper for the OMN-129 JSON.stringify boundary.
 *
 * Since OMN-129 the read side hands its OmniJS program across the JXA→OmniJS
 * boundary as `app.evaluateJavascript(${JSON.stringify(program)})` — a JSON string
 * literal, not a nested backtick. Builder unit tests that want to assert on the
 * generated PREDICATE text should assert against the recovered (decoded) program,
 * where quotes are unescaped, rather than the doubly-encoded outer script text.
 *
 * Returns every OmniJS program recovered from a generated JXA script, recursing for
 * the list-tasks path which nests one program inside another.
 */
export function recoverInnerPrograms(script: string): string[] {
  const out: string[] = [];
  const marker = 'evaluateJavascript(';
  let i = 0;
  while ((i = script.indexOf(marker, i)) !== -1) {
    let j = i + marker.length;
    while (j < script.length && /\s/.test(script[j]!)) j++;
    if (script[j] !== '"') {
      i = j;
      continue;
    }
    let k = j + 1;
    let lit = '"';
    while (k < script.length) {
      const ch = script[k]!;
      lit += ch;
      if (ch === '\\') {
        lit += script[k + 1] ?? '';
        k += 2;
        continue;
      }
      if (ch === '"') {
        k++;
        break;
      }
      k++;
    }
    try {
      const inner = JSON.parse(lit) as string;
      out.push(inner);
      out.push(...recoverInnerPrograms(inner));
    } catch {
      // not a recoverable JSON string; skip
    }
    i = k;
  }
  return out;
}

/** Convenience: the single recovered OmniJS program (throws if not exactly one). */
export function recoverInnerProgram(script: string): string {
  const programs = recoverInnerPrograms(script);
  if (programs.length === 0) throw new Error('no JSON.stringify bridge program found in script');
  return programs[0]!;
}

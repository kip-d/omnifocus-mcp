// OMN-284 — readOnlyHint must accurately reflect whether a tool can mutate
// state, not just whether it mutates OmniFocus task/project data. MCP
// clients trust readOnlyHint for consent/confirmation UX (the MCP spec's own
// caveat that clients "should never make tool use decisions based on"
// annotations doesn't stop real clients from doing exactly that in practice
// — see the ticket's rationale).
//
// Two tools were mislabeled `readOnlyHint: true` despite having a mutating
// operation:
//   - OmniFocusAnalyzeTool: manage_reviews.mark_reviewed / set_schedule
//     mutate OmniFocus project data.
//   - SystemTool: operation:"cache", cacheAction:"clear" mutates the
//     server's own cache state (a real, user-directed, observable side
//     effect — not incidental read-through cache population, which every
//     cached read API does transparently and does NOT count as a mutation
//     for this purpose).
//
// OmniFocusReadTool's incidental `cache.set()` calls (populating the cache
// as a side effect of serving a read) are NOT the same class — they're
// invisible to the caller and don't change anything the caller asked
// about — so OmniFocusReadTool correctly stays readOnlyHint:true.
import { describe, it, expect } from 'vitest';
import { OmniFocusReadTool } from '../../../../src/tools/unified/OmniFocusReadTool.js';
import { OmniFocusWriteTool } from '../../../../src/tools/unified/OmniFocusWriteTool.js';
import { OmniFocusAnalyzeTool } from '../../../../src/tools/unified/OmniFocusAnalyzeTool.js';
import { SystemTool } from '../../../../src/tools/system/SystemTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';

describe('OMN-284: readOnlyHint honesty across unified tools', () => {
  const cache = new CacheManager();

  it('OmniFocusReadTool stays readOnlyHint:true (genuinely read-only)', () => {
    expect(new OmniFocusReadTool(cache).annotations.readOnlyHint).toBe(true);
  });

  it('OmniFocusWriteTool stays readOnlyHint:false (always was correct)', () => {
    expect(new OmniFocusWriteTool(cache).annotations.readOnlyHint).toBe(false);
  });

  it('OmniFocusAnalyzeTool is readOnlyHint:false — manage_reviews mutates project data', () => {
    expect(new OmniFocusAnalyzeTool(cache).annotations.readOnlyHint).toBe(false);
  });

  it('SystemTool is readOnlyHint:false — operation:"cache" action:"clear" mutates cache state', () => {
    expect(new SystemTool(cache).annotations.readOnlyHint).toBe(false);
  });
});

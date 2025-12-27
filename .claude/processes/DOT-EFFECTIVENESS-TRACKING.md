# DOT File Effectiveness Tracking

Track whether Claude follows the processes defined in `CLAUDE-PROCESSES.dot`.

## How to Use

1. Copy a session template below when starting a session
2. Note which triggers occurred naturally during the session
3. Record whether Claude followed the expected DOT path
4. At session end, optionally ask Claude: "Which processes from the DOT file did you follow?"
5. After ~10 sessions, review the summary

---

## Trigger → Expected Behavior Reference

| Trigger Type | Example | Expected DOT Path |
|--------------|---------|-------------------|
| Bug fix request | "Fix this error in X" | cluster_debugging (MCP-first) or cluster_general_debug |
| New feature | "Add feature Y" | cluster_understand → cluster_pre_code → cluster_implement (TDD skill) |
| Optimization | "Make this faster" | Check cluster_warnings (MEASURE before optimizing) |
| Large change | "Refactor the auth system" | cluster_understand (>10 files? → get permission) |
| Confusion expressed | "I don't understand why..." | cluster_stuck (document → 3rd attempt? → ask) |
| Script needed | "Write a script to..." | cluster_jxa_bridge (items >100? → tags needed?) |
| Task completion | Any completed task | cluster_verify (test → build → lint → debug output → docs → TODOs) |
| Documentation edit | "Update the README" | cluster_verify includes elements-of-style skill |

---

## Session Log

### Session: YYYY-MM-DD-001

**Configuration:** [ ] DOT + prose | [ ] Prose only | [ ] DOT only

**Triggers observed:**

| Time | Trigger | Expected Path | Followed? | Notes |
|------|---------|---------------|-----------|-------|
| | | | | |
| | | | | |
| | | | | |

**End-of-session check:** Asked Claude which DOT processes it followed?
- [ ] Yes → Response:
- [ ] No

**Session score:** ___/___  triggers followed correctly

---

### Session: YYYY-MM-DD-002

**Configuration:** [ ] DOT + prose | [ ] Prose only | [ ] DOT only

**Triggers observed:**

| Time | Trigger | Expected Path | Followed? | Notes |
|------|---------|---------------|-----------|-------|
| | | | | |
| | | | | |
| | | | | |

**End-of-session check:** Asked Claude which DOT processes it followed?
- [ ] Yes → Response:
- [ ] No

**Session score:** ___/___  triggers followed correctly

---

### Session: YYYY-MM-DD-003

**Configuration:** [ ] DOT + prose | [ ] Prose only | [ ] DOT only

**Triggers observed:**

| Time | Trigger | Expected Path | Followed? | Notes |
|------|---------|---------------|-----------|-------|
| | | | | |
| | | | | |
| | | | | |

**End-of-session check:** Asked Claude which DOT processes it followed?
- [ ] Yes → Response:
- [ ] No

**Session score:** ___/___  triggers followed correctly

---

## Summary (fill after ~10 sessions)

### Aggregate Results

| Configuration | Sessions | Triggers | Followed | Rate |
|---------------|----------|----------|----------|------|
| DOT + prose | | | | % |
| Prose only | | | | % |
| DOT only | | | | % |

### By Trigger Type

| Trigger Type | Total | Followed | Rate | Notes |
|--------------|-------|----------|------|-------|
| Bug fix (MCP-first) | | | % | |
| New feature (TDD) | | | % | |
| Optimization (MEASURE) | | | % | |
| Large change (permission) | | | % | |
| Stuck (escalation) | | | % | |
| Script (JXA/bridge) | | | % | |
| Completion (verify) | | | % | |
| Docs (elements-of-style) | | | % | |

### Observations

**DOT helped with:**
-

**DOT didn't help with:**
-

**Unexpected behaviors:**
-

### Decision

Based on tracking data:
- [ ] Keep DOT + prose (no change)
- [ ] Remove prose duplicates (DOT effective)
- [ ] Remove DOT (not effective)
- [ ] Modify DOT (specific changes needed)

---

## Quick Copy Template

```markdown
### Session: YYYY-MM-DD-00X

**Configuration:** [ ] DOT + prose | [ ] Prose only | [ ] DOT only

**Triggers observed:**

| Time | Trigger | Expected Path | Followed? | Notes |
|------|---------|---------------|-----------|-------|
| | | | | |

**End-of-session check:** Asked Claude which DOT processes it followed?
- [ ] Yes → Response:
- [ ] No

**Session score:** ___/___  triggers followed correctly
```

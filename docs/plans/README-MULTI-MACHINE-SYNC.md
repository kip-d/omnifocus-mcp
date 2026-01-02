# Multi-Machine Session Sync - Quick Reference & Status

**Status:** Documented design (not yet implemented). Ready to pick up when needed.

**Last Updated:** October 21, 2025 — Design finalized with clear purpose definition

## Overview

The multi-machine session sync project has been **moved to a separate repository** to keep it independent from the
OmniFocus MCP server work.

**Separate Repository:** `~/src/multi-machine-claude-resume`

This is a general-purpose tool for managing work across multiple machines and should not be mixed with OmniFocus
MCP-specific code.

## Design Decision: Session Checkpoint Purpose (Oct 21, 2025)

**Chosen approach: Option 2 - Historical work logs for analysis/patterns**

The session checkpoint serves a **metadata/context purpose**, NOT as primary state sync:

1. **Historical work log** - `session-history.md` records what you worked on, when, from which machine
   - Enables understanding work patterns and distribution
   - Example: `"2025-10-21 10:30 [macbook-kip-main] Fixed tag assignment (branch: main)"`

2. **Quick context reminder** - Before switching machines, know:
   - What task you were last working on
   - Which branch/commit
   - Which machine (useful for hardware context)

3. **NOT primary state sync** - iCloud symlink already handles 95% (code, configs, agents)
   - Checkpoint is informational metadata only
   - All actual work state syncs automatically via iCloud

**Recommended workflow:**

```bash
save-session "What you were working on"    # Before leaving machine
# ~15 seconds for iCloud sync
restore-session                             # On new machine to see context
```

## Separate Repository Documentation

- **README**: Full documentation with features, requirements, workflow
- **QUICK_START.md**: 5-minute setup guide
- **setup.sh**: Automated installation script

## What It Does

Provides shell functions for capturing and restoring session state across machines:

- `save-session` - Capture git branch, commit, current task, test results
- `restore-session` - View last checkpoint and instructions to continue
- `session-log` - View session history across all machines
- `session-status` - Check current machine and checkpoint status

Syncs via iCloud Drive for automatic cross-machine synchronization.

## Integration with Claude Code

- **Complements** `claude --resume` (which restores conversation history)
- **Captures** project state (git, task, tests, todos)
- **Together** provide complete context for multi-machine work

## Original Planning Document

See `docs/plans/2025-10-18-multi-machine-session-sync.md` for the original design exploration and requirements
gathering.

This design document is kept here for historical context and shows the design thinking that led to the separate
repository approach.

## Next Steps

1. Clone/set up the separate repo: `~/src/multi-machine-claude-resume`
2. Follow QUICK_START.md for primary machine setup
3. Repeat on secondary machines
4. Test sync workflow

See `~/src/multi-machine-claude-resume` for complete instructions.

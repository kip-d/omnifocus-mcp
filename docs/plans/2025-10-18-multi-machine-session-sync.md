# Multi-Machine Session Sync Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Enable seamless work continuation across 3 macOS machines by syncing `~/.claude/` via iCloud and implementing session checkpoint/resume functionality.

**Architecture:** Symlink `~/.claude/` to iCloud Drive for automatic cross-machine sync, maintain session state in JSON checkpoints (machine, branch, todos, test results), implement shell functions to save/restore sessions. No code changes to Claude Code itself—purely filesystem and shell layer.

**Tech Stack:** macOS symlinks, iCloud Drive, JSON (session checkpoint), bash/zsh shell functions

---

## Task 1: Set up iCloud directory structure

**Files:**
- Create: `~/Library/Mobile Documents/com~apple~CloudDocs/.claude/`
- Create: Shell script helpers in your dotfiles

**Step 1: Verify iCloud Drive is synced on all 3 machines**

Run on each machine:
```bash
ls -la ~/Library/Mobile\ Documents/com~apple~CloudDocs/
```

Expected: Directory exists and is accessible

**Step 2: Create .claude in iCloud on primary machine**

```bash
mkdir -p ~/Library/Mobile\ Documents/com~apple~CloudDocs/.claude
```

Expected: Directory created

**Step 3: Move existing ~/.claude content to iCloud**

```bash
# Backup current ~/.claude first
cp -r ~/.claude ~/.claude.backup

# Move to iCloud
mv ~/.claude/* ~/Library/Mobile\ Documents/com~apple~CloudDocs/.claude/

# Verify all content moved
ls -la ~/Library/Mobile\ Documents/com~apple~CloudDocs/.claude/ | head -20
```

Expected: All files present in iCloud directory, original ~/.claude now empty

**Step 4: Create symlink**

```bash
rm -rf ~/.claude  # Remove empty directory
ln -s ~/Library/Mobile\ Documents/com~apple~CloudDocs/.claude ~/.claude

# Verify symlink works
ls -la ~/.claude
ls ~/.claude/projects/  # Should show project data
```

Expected: Symlink created, `~/.claude` points to iCloud location, all content accessible

**Step 5: Verify on second machine (wait for iCloud sync)**

```bash
# Wait 10-30 seconds for iCloud sync
sleep 15

# Create symlink on machine 2
ln -s ~/Library/Mobile\ Documents/com~apple~CloudDocs/.claude ~/.claude

# Verify content is present
ls ~/.claude/projects/omnifocus-mcp/
ls ~/.claude/agents/
```

Expected: All content from machine 1 is visible, symlink works

**Step 6: Repeat on third machine**

Same as Step 5

**Step 7: Commit backup (optional safety)**

```bash
# If you want to keep the backup in git temporarily
git status | grep claude.backup
# Or delete if everything looks good
rm -rf ~/.claude.backup
```

---

## Task 2: Create session checkpoint schema and helpers

**Files:**
- Create: `~/.claude/session-checkpoint.json` (template)
- Create: `~/.claude/session-manifest.md` (documentation)

**Step 1: Define checkpoint JSON schema**

Create `~/.claude/session-checkpoint.json`:

```json
{
  "timestamp": "2025-10-18T21:30:00Z",
  "machine": "machine-name",
  "git": {
    "branch": "main",
    "lastCommit": "b2e81f9",
    "status": "clean"
  },
  "workSession": {
    "currentTask": "Merge profiling-benchmarking branch",
    "lastFile": "src/tools/system/SystemToolV2.ts",
    "testResults": "39/76 passing"
  },
  "todos": {
    "inProgress": ["Fix tag response structure"],
    "pending": ["Merge profiling branch", "Evaluate optimization results"],
    "completed": ["Add version detection", "Fix cleanup methods"]
  }
}
```

**Step 2: Create session manifest documentation**

Create `~/.claude/session-manifest.md`:

```markdown
# Session Checkpoint Guide

## File Structure

- `session-checkpoint.json` - Current session state (updated manually or via scripts)
- `session-history.md` - Work log across sessions
- `projects/` - Project-specific ccusage data (auto-synced)
- `agents/` - Global agents (synced across machines)

## Session Fields

- `timestamp`: ISO timestamp when session was saved
- `machine`: Machine name where session was saved (for context)
- `git.branch`: Current branch
- `git.lastCommit`: Last commit hash
- `git.status`: "clean" or "dirty"
- `workSession.currentTask`: What you were working on
- `workSession.lastFile`: File you last edited
- `workSession.testResults`: Summary of last test run
- `todos`: Current todo snapshot

## Usage

Save session before leaving a machine:
```bash
save-session "Debugging planned dates timeout"
```

Resume on new machine:
```bash
claude --resume  # or restore-session
```

## Machine Names

Add to your shell profile to identify machines:
```bash
export MACHINE_NAME="macbook-kip-main"  # or similar
```
```

**Step 3: Verify files created**

```bash
cat ~/.claude/session-checkpoint.json
cat ~/.claude/session-manifest.md
```

Expected: Both files readable with valid JSON and markdown

---

## Task 3: Create session management shell functions

**Files:**
- Modify: `~/.zshrc` (or `~/.bashrc`)
- Create: `~/.claude/session-functions.sh` (shared functions)

**Step 1: Create session-functions.sh**

Create `~/.claude/session-functions.sh`:

```bash
#!/bin/bash

# Session management functions for multi-machine sync
# Source this in your shell profile: source ~/.claude/session-functions.sh

CHECKPOINT_FILE="$HOME/.claude/session-checkpoint.json"
HISTORY_FILE="$HOME/.claude/session-history.md"
MACHINE_NAME="${MACHINE_NAME:-$(hostname -s)}"

save-session() {
    local task_description="${1:-Auto-save}"
    local branch=$(git -C ~/src/omnifocus-mcp rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    local commit=$(git -C ~/src/omnifocus-mcp rev-parse --short HEAD 2>/dev/null || echo "unknown")
    local status=$(git -C ~/src/omnifocus-mcp status --porcelain 2>/dev/null | wc -l)
    local git_status=$([[ $status -eq 0 ]] && echo "clean" || echo "dirty")

    cat > "$CHECKPOINT_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "machine": "$MACHINE_NAME",
  "git": {
    "branch": "$branch",
    "lastCommit": "$commit",
    "status": "$git_status"
  },
  "workSession": {
    "currentTask": "$task_description",
    "timestamp": "$(date)"
  }
}
EOF

    # Append to history
    echo "- [$MACHINE_NAME] $(date): $task_description (branch: $branch)" >> "$HISTORY_FILE"

    echo "✅ Session saved: $task_description"
    cat "$CHECKPOINT_FILE" | jq '.'
}

restore-session() {
    if [[ ! -f "$CHECKPOINT_FILE" ]]; then
        echo "❌ No session checkpoint found at $CHECKPOINT_FILE"
        return 1
    fi

    echo "📋 Last session state:"
    cat "$CHECKPOINT_FILE" | jq '.'

    local branch=$(cat "$CHECKPOINT_FILE" | jq -r '.git.branch')
    local task=$(cat "$CHECKPOINT_FILE" | jq -r '.workSession.currentTask')

    echo ""
    echo "💡 Previous task: $task"
    echo "🔀 Branch: $branch"
    echo ""
    echo "To continue, run: cd ~/src/omnifocus-mcp && git checkout $branch"
}

session-log() {
    echo "📜 Session history:"
    tail -20 "$HISTORY_FILE"
}
```

**Step 2: Add to shell profile**

Edit `~/.zshrc` (or `~/.bashrc`):

```bash
# Multi-machine session sync
export MACHINE_NAME="macbook-$(whoami)-primary"  # Customize per machine
source ~/.claude/session-functions.sh
```

**Step 3: Make functions executable and test**

```bash
chmod +x ~/.claude/session-functions.sh

# Source in current shell
source ~/.claude/session-functions.sh

# Test the function
save-session "Testing session checkpoint"
```

Expected: `session-checkpoint.json` updated with current state

**Step 4: Test restore**

```bash
restore-session
```

Expected: Shows last checkpoint state and instructions to continue

**Step 5: Verify on second machine after iCloud sync**

```bash
# On machine 2, after pulling repo
source ~/.claude/session-functions.sh
restore-session
```

Expected: Shows checkpoint from machine 1

---

## Task 4: Add claude --resume mock (documentation)

**Files:**
- Create: `~/.claude/RESUME_USAGE.md`

**Step 1: Document expected CLI integration**

Create `~/.claude/RESUME_USAGE.md`:

```markdown
# Claude Code Resume Integration

## Goal

When Claude Code adds `--resume` flag support, these session checkpoints will feed into it.

## Proposed CLI Usage

```bash
claude --resume ~/src/omnifocus-mcp
```

This would:
1. Read `~/.claude/session-checkpoint.json`
2. Verify machine name matches (warn if different)
3. Load last branch/commit state
4. Populate session context with prior work state
5. Resume with knowledge of what you were working on

## Current Workaround

Until CLI support exists, use:

```bash
# Before leaving machine A:
save-session "Your task here"

# On machine B:
restore-session  # Shows what you were doing
```

## Integration Points

- Checkpoint feeds session history to Claude context
- Machine name prevents confusion ("wait, was I on the laptop?")
- Test results summary shows what was last passing
- Todo list restores your task context

## Future Enhancement

Could extend to:
```bash
claude --resume --execute-next-todo  # Auto-run next pending task
claude --resume --show-diff          # Show changes since last session
```
```

**Step 2: Verify documentation**

```bash
cat ~/.claude/RESUME_USAGE.md
```

Expected: Markdown readable, explains both current workaround and future integration

---

## Task 5: Test full cycle on all 3 machines

**Files:**
- None (integration test only)

**Step 1: Full test on Machine A**

```bash
cd ~/src/omnifocus-mcp
git status

# Simulate working on something
echo "Test change" >> README.md

# Save session before leaving
save-session "Testing multi-machine sync: added test change to README"

# Verify checkpoint
cat ~/.claude/session-checkpoint.json | jq '.'
```

Expected: Checkpoint shows current branch, commit, and task description

**Step 2: Wait for iCloud sync (30 seconds)**

```bash
sleep 30
```

Expected: iCloud syncs checkpoint to cloud

**Step 3: Switch to Machine B and restore**

```bash
cd ~/src/omnifocus-mcp

# Restore session
restore-session

# Verify you see the same checkpoint
```

Expected: Checkpoint from Machine A is visible on Machine B

**Step 4: Clean up test change**

```bash
cd ~/src/omnifocus-mcp
git checkout README.md
```

**Step 5: Repeat test on Machine C**

Ensure Machine C also sees the synced checkpoint

**Step 6: Verify agents synced**

```bash
ls ~/.claude/agents/
```

Expected: All custom agents visible on all machines

---

## Commits

```bash
# After Task 1 complete
git add .gitignore  # Already ignores .claude/
git commit -m "docs: add multi-machine session sync guide"

# After all tasks
git add docs/plans/
git commit -m "docs: add multi-machine session sync implementation plan"
```

---

## Notes

- **No code changes to Claude Code** - This is purely filesystem/shell layer
- **iCloud sync timing** - Allow 10-30 seconds between machines for sync
- **Session state is informational** - Designed for your reference, not automated yet
- **Machine names matter** - Helps identify which machine saved the checkpoint
- **Can evolve** - Functions can be enhanced as you discover what's most useful

---

## Execution Handoff

**Plan complete!** Two execution options:

**1. Self-Guided (Recommended for this)**
- You implement each task sequentially on your 3 machines
- Leverage the shell functions immediately
- Tailor machine names to your setup
- Monitor iCloud sync between steps

**2. Fresh Subagent Per Step**
- Launch subagent-driven execution with this plan
- Each task gets reviewed before proceeding
- More formal audit trail

**Which approach?**

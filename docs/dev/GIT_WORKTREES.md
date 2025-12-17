# Git Worktrees Reference

**Last Updated:** 2025-11-09 **Status:** Production guidance based on real-world experience

## What Are Git Worktrees?

Git worktrees allow you to check out multiple branches simultaneously in different directories. Instead of switching
branches in your main repo, you create separate working directories that share the same git repository.

## When to Use Worktrees

**✅ Good Use Cases:**

- Long-running feature development while maintaining main branch
- Working on multiple features in parallel
- Need to test/compare code between branches without switching
- Running builds/tests on different branches simultaneously
- Keeping main pristine while experimenting

**❌ Poor Use Cases:**

- Quick bug fixes (just use normal branches)
- Single feature work (no benefit over regular workflow)
- When you need GitHub CLI's automated merge operations
- Projects with extensive uncommitted changes you can't commit

## The Worktree Experience: Reality vs. Expectations

### What Worktrees DO Well

- ✅ Isolate your work from main repository
- ✅ Allow parallel development on multiple branches
- ✅ Prevent accidental commits to wrong branch
- ✅ Keep main branch clean and ready for production

### What Worktrees DON'T Solve

- ❌ GitHub CLI automation (`gh pr merge --delete-branch` fails on cleanup)
- ❌ Simplifying merge workflows (actually adds complexity)
- ❌ Eliminating manual cleanup steps
- ❌ Making error messages clearer (often more confusing)

### Key Insight

**Worktrees trade automated convenience for isolation.** You get safety and parallel work, but lose the seamless
automation of GitHub CLI's merge and cleanup operations.

## Complete Worktree Workflow

### 1. Creating a Worktree

```bash
# In your main repository
cd /path/to/your/repo

# Create worktree for new feature
git worktree add .worktrees/feature-name -b feature/feature-name

# Or create from existing branch
git worktree add .worktrees/feature-name feature/feature-name

# Work in the worktree
cd .worktrees/feature-name
```

**Recommended structure:**

```
my-project/
├── .git/
├── src/
├── .worktrees/         # All worktrees in one place
│   ├── feature-a/
│   ├── bugfix-b/
│   └── refactor-c/
```

### 2. Working in the Worktree

```bash
# Normal git operations work as expected
cd .worktrees/feature-name
git add .
git commit -m "Feature changes"
git push origin feature/feature-name

# Create PR from GitHub web UI or CLI
gh pr create --base main --head feature/feature-name
```

### 3. Merging with Worktrees: TWO APPROACHES

#### Approach A: Manual GitHub Merge (RECOMMENDED)

**Pros:** Clear, predictable, you control each step **Cons:** More manual steps

```bash
# 1. Merge PR on GitHub (web UI or CLI without --delete-branch)
gh pr merge 30 --squash
# OR use GitHub web UI

# 2. Switch to main repo and update
cd /path/to/main/repo
git checkout main
git pull origin main

# 3. Clean up worktree and branch
git worktree remove .worktrees/feature-name --force
git branch -D feature/feature-name
```

#### Approach B: GitHub CLI with Manual Cleanup

**Pros:** Uses familiar `gh pr merge` command **Cons:** Confusing error messages, merge succeeds but cleanup fails

```bash
# 1. Try to merge with GitHub CLI
gh pr merge 30 --squash --delete-branch
# This will:
# ✅ Merge PR on GitHub successfully
# ❌ Fail to fast-forward local main (scary error)
# ❌ Fail to delete local branch (scary error)

# 2. Don't panic! Check if merge succeeded
gh pr view 30 --json state,mergedAt

# 3. If merged, clean up manually
cd /path/to/main/repo
git checkout main
git reset --hard origin/main  # Sync with GitHub
git worktree remove .worktrees/feature-name --force
git branch -D feature/feature-name
```

### 4. Complete Cleanup

```bash
# List all worktrees
git worktree list

# Prune stale worktrees (if directories were deleted)
git worktree prune

# Remove worktree (from main repo)
git worktree remove .worktrees/feature-name

# If it has uncommitted changes, use --force
git worktree remove .worktrees/feature-name --force

# Delete the feature branch
git branch -D feature/feature-name

# Verify clean state
git worktree list
git branch -a
```

## Common Issues and Solutions

### Issue 1: "Cannot delete branch used by worktree"

**Error:**

```
error: cannot delete branch 'feature/name' used by worktree at '/path/to/repo'
```

**Cause:** You're on the feature branch in main repo, or worktree still exists

**Solution:**

```bash
# Check current branch
git branch --show-current

# Switch to main if needed
git checkout main

# Remove worktree first, then delete branch
git worktree remove .worktrees/feature-name --force
git branch -D feature/name
```

### Issue 2: "Contains modified or untracked files"

**Error:**

```
fatal: '.worktrees/feature-name' contains modified or untracked files, use --force to delete it
```

**Cause:** Uncommitted changes or untracked files in worktree

**Solution:**

```bash
# If changes are not needed (after merge), force remove
git worktree remove .worktrees/feature-name --force

# If changes are needed, commit them first
cd .worktrees/feature-name
git add .
git commit -m "Save changes"
git push
cd ../..
git worktree remove .worktrees/feature-name
```

### Issue 3: "Not possible to fast-forward"

**Error:**

```
! [remote rejected] main -> main (not possible to fast-forward)
```

**Cause:** Local main has diverged from origin/main during merge process

**Solution:**

```bash
# Reset local main to match GitHub
git checkout main
git reset --hard origin/main

# Now you're in sync
git log -1  # Verify you see the merge commit
```

### Issue 4: GitHub CLI merge appears to fail

**Symptom:** `gh pr merge` shows errors about fast-forward and branch deletion

**Reality:** The PR merge on GitHub likely succeeded! The errors are only about local cleanup.

**Solution:**

```bash
# FIRST: Verify if PR actually merged
gh pr view <number> --json state,mergedAt,mergedBy

# If mergedAt has a timestamp, it worked!
# Then just do manual cleanup as shown above
```

## Gotchas and Lessons Learned

### 1. GitHub CLI Automation Doesn't Understand Worktrees

**Problem:** `gh pr merge --delete-branch` expects a normal git workflow.

**Reality:** It will:

- ✅ Merge the PR on GitHub successfully
- ❌ Fail to update local main (not in worktree)
- ❌ Fail to delete local branch (worktree using it)

**Lesson:** Use `gh pr merge` WITHOUT `--delete-branch` and clean up manually.

### 2. Error Messages Are Confusing

**Problem:** When cleanup fails, errors look like the merge failed.

**Reality:** Check the PR status on GitHub - merge probably succeeded!

**Lesson:** Always verify PR state with `gh pr view <number>` before assuming failure.

### 3. Worktree Removal Needs Force

**Problem:** Can't remove worktree if it has uncommitted work.

**Reality:** After merging, those changes are in main, so forcing is safe.

**Lesson:** `git worktree remove --force` is normal and expected after merge.

### 4. You Can't Delete Branches You're On

**Problem:** Can't delete feature branch while checked out on it.

**Reality:** Main repo might be on feature branch from `git pull origin main`.

**Lesson:** Always `git checkout main` before deleting feature branches.

## Recommended Workflow Summary

**For worktrees + GitHub PRs:**

1. **Create worktree** for feature work
2. **Develop and push** in worktree
3. **Create PR** using GitHub web UI or `gh pr create`
4. **Merge on GitHub** with web UI or `gh pr merge <number> --squash` (NO --delete-branch)
5. **Clean up manually:**
   ```bash
   cd /path/to/main/repo
   git checkout main
   git pull origin main
   git worktree remove .worktrees/feature-name --force
   git branch -D feature/feature-name
   ```

**For simple feature work:**

Just use regular branches - worktrees add complexity without benefit.

## When to Choose Worktrees vs. Regular Branches

| Scenario                           | Use Worktrees    | Use Regular Branches         |
| ---------------------------------- | ---------------- | ---------------------------- |
| Long-running feature (days/weeks)  | ✅ Yes           | ⚠️ Possible but risky        |
| Multiple features in parallel      | ✅ Yes           | ❌ No (switching is painful) |
| Quick bug fix                      | ❌ No (overkill) | ✅ Yes                       |
| Need to compare branches           | ✅ Yes           | ⚠️ Can use diffs instead     |
| Running tests on multiple branches | ✅ Yes           | ❌ No                        |
| Single feature, no distractions    | ⚠️ Possible      | ✅ Yes (simpler)             |

## Additional Resources

**Official Git documentation:**

- `git worktree --help`
- https://git-scm.com/docs/git-worktree

**GitHub CLI:**

- `gh pr --help`
- https://cli.github.com/manual/gh_pr_merge

## Appendix: Complete Example Session

```bash
# === SETUP ===
cd ~/projects/my-app
git worktree add .worktrees/feature-auth -b feature/authentication
cd .worktrees/feature-auth

# === DEVELOPMENT ===
# ... make changes ...
git add .
git commit -m "Add authentication system"
git push origin feature/authentication

# === CREATE PR ===
gh pr create --base main --head feature/authentication \
  --title "Add authentication" \
  --body "Implements JWT-based auth"

# === MERGE (MANUAL - RECOMMENDED) ===
# Use GitHub web UI to merge PR, OR:
gh pr merge 123 --squash  # Note: NO --delete-branch

# === CLEANUP ===
cd ~/projects/my-app
git checkout main
git pull origin main
git worktree remove .worktrees/feature-auth --force
git branch -D feature/authentication

# === VERIFY ===
git worktree list  # Should not show feature-auth
git branch -a      # Should not show feature/authentication locally
```

## Protecting Upstream Remote

**IMPORTANT:** When working with forks, protect your upstream remote from accidental pushes:

```bash
# Disable pushing to upstream (one-time setup)
git remote set-url --push upstream no_push

# Verify protection
git remote -v
# Should show:
# upstream  https://github.com/original/repo.git (fetch)
# upstream  no_push (push)
```

**What this protects:**

- ✅ Can still fetch/pull from upstream
- ✅ Can still create PRs to upstream
- ❌ **Cannot** accidentally push to upstream
- ❌ **Cannot** delete upstream branches

**To push to upstream (if you have permissions and really need to):**

```bash
# Temporarily override (use with extreme caution!)
git push https://github.com/original/repo.git branch-name
```

## Summary

**Worktrees are powerful for parallel work and isolation, but they don't play nicely with automated merge tools.**

**Key Takeaway:** If you use worktrees, embrace manual cleanup. Don't expect GitHub CLI's automation to "just work" - it
won't. The trade-off is worth it for long-running feature work, but not for simple fixes.

**Rule of thumb:** Worktrees for features that need days/weeks. Regular branches for everything else.

**Safety rule:** Always protect upstream with `git remote set-url --push upstream no_push`.

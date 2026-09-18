# OmniFocus API TypeScript Definitions

This directory contains the official TypeScript definitions for OmniFocus automation.

## Current Version: OmniFocus.d.ts → OmniFocus-4.9-d.ts

- **Current**: `OmniFocus.d.ts` (symlink to latest version)
- **Latest Version**: OmniFocus 4.9
- **Previous Version**: OmniFocus 4.8.11 (kept for reference)
- **Minimum Required**: OmniFocus 4.7+
- **Drift note**: 4.8.11 → 4.9 adds four members and removes none (verified 2026-09-15, class/member-name diff): see
  Version History. The regenerate-and-diff step is the platform-drift signal for the OMN-148 behavioral spec (its
  platform-contract source).

## File Structure

- `OmniFocus.d.ts` - Symlink to the current version (always points to latest)
- `OmniFocus-4.9-d.ts` - Official TypeScript definitions for OmniFocus 4.9
- `OmniFocus-4.8.11-d.ts` - TypeScript definitions for OmniFocus 4.8.11 (previous)
- `OmniFocus-extensions.d.ts` - Undocumented but working properties (empirically verified)

### Manual carry-overs each regeneration

Both are mechanical and hand-done today; OMN-328 tracks scripting them.

1. The regen-instructions header block (the raw export lacks it).
2. **Optional-before-required normalization.** The 4.9 export marks a parameter `?:` whenever it accepts `null`, even
   when a required parameter follows it. TypeScript's grammar rejects that (TS1016). Saved as a real `.d.ts` with
   `skipLibCheck` (tsc's default, and set in this repo's `tsconfig`) the export compiles clean — but this directory's
   versioned files are named `OmniFocus-X.Y-d.ts`, and hyphen-d is not a declaration file, so `skipLibCheck` does not
   cover them and `npm run build` fails. Drop the `?` on every optional parameter that precedes a required one; the type
   stays `T | null`, so nothing is lost. Do this on the raw single-line export, before prettier wraps signatures.
   `npx tsc --noEmit -p tsconfig.json` lists every site you missed. Re-derive the site list from that output at every
   regeneration; the table below records what 4.9 needed and is a snapshot, not a checklist for later versions:

   | Declaration                              | Parameter(s) losing `?` | Required parameter that follows |
   | ---------------------------------------- | ----------------------- | ------------------------------- |
   | `Application.openDocument`               | `from`                  | `url`, `completed`              |
   | `FileWrapper.withContents`               | `name`                  | `contents`                      |
   | `FileWrapper.withChildren`               | `name`                  | `children`                      |
   | `Form.Field.MultipleOptions` constructor | `displayName`, `names`  | `options`, `selected`           |
   | `Form.Field.Option` constructor          | `displayName`           | `options`                       |
   | `LanguageModel.Tool` constructor         | `inputSchema`           | `f`                             |
   | `Settings.setObjectForKey`               | `value`                 | `key`                           |

### Retired carry-over

The `_omnijs_AnonymousProxy` placeholder that 4.8.x exports needed is gone — 4.9 declares `LanguageModel.Tool` and types
`Session.withTools()` against it.

### Diffing two snapshots

Compare by class and member name, never by line. The pre-commit hook prettier-reformats the export (4-space → 2-space
indents), 4.9 marks optional parameters `?:` where 4.8.x did not, and prettier then wraps the longer signatures across
lines — so both a bare `diff` and a sorted-line diff are pure noise. Parse each file into
`{container → set of whitespace-stripped member lines}` (drop `?` markers and trailing punctuation) and diff the sets.
No checked-in script does this yet; OMN-328 adds one alongside the regen tooling.

## Usage

These definitions provide type information for all OmniFocus automation objects and methods available through JavaScript
for Automation (JXA).

### Key Classes:

- `Task` - Core task management
- `Project` - Project management
- `Tag` - Tag management
- `Document` - Document-level operations
- `Database` - Database operations
- `Perspective` - Perspective management

### Important Notes:

1. These are the official API definitions from OmniGroup
2. They represent the actual automation interface available in each OmniFocus version
3. Some methods in these definitions may behave differently in JXA context
4. Always test automation scripts in OmniFocus before relying on them
5. Version-specific features (like Anchor Dates in 4.8+) are only available in corresponding versions

## Undocumented API Extensions

The `OmniFocus-extensions.d.ts` file contains properties not included in the official API export but accessible via JXA.

**Verified on OmniFocus 4.9** (2026-09-16, macOS 27) - All 14 properties tested ✅ (previously 4.8.3, October 2025).
Note: `project.nextTask` returns a JXA object specifier (`typeof` reports `'function'`, and `String()` on it throws
"Can't convert types"). The probe describes every value with `Automation.getDisplayString()`, JXA's own formatter, so a
specifier prints as its object path; a value that can be read but not described is counted as a failure, not a pass.

### Project Extensions (4 properties)

- `effectiveStatus: Project.Status` - Effective status considering parent folders
- `singletonActionHolder: boolean` - Whether project contains singleton actions
- `nextTask: Task | null` - Next actionable child task in this project
- `defaultSingletonActionHolder: boolean` - Whether this is the default singleton action holder

### Tag Extensions (2 properties)

- `availableTaskCount: number` - Number of available tasks with this tag or descendants
- `remainingTaskCount: number` - Number of incomplete tasks with this tag or descendants

### Task Extensions (8 properties)

- `numberOfTasks: number` - Total number of direct child tasks
- `numberOfAvailableTasks: number` - Number of available direct child tasks
- `numberOfCompletedTasks: number` - Number of completed direct child tasks
- `next: boolean` - Whether this is the next actionable task in its project
- `blocked: boolean` - Whether task has blocking dependencies
- `effectivelyCompleted: boolean` - Whether task or its container is completed
- `effectivelyDropped: boolean` - Whether task or its container is dropped

**Testing:** Run `osascript -l JavaScript tests/manual/test-extensions.js` to verify these properties on your OmniFocus
version (it is a JXA script, not Node; `node` fails on `Application`).

## How to Regenerate API Definitions

When a new version of OmniFocus is released, follow these steps to update the TypeScript definitions:

### Step 1: Export from OmniFocus

OmniFocus 4.9+ exposes the export as an API, so this is a one-liner (OmniFocus must be running; the first line of the
output names the version and build):

```bash
osascript -l JavaScript -e 'Application("OmniFocus").evaluateJavascript("app.getTypeScriptDeclarations()")' \
  > src/omnifocus/api/OmniFocus-[VERSION]-d.ts
```

Replace `[VERSION]` with the version from the first line of the output (e.g., `4.9`). The export includes Omni's
per-member doc comments; keep them.

Fallback for OmniFocus older than 4.9 (no `getTypeScriptDeclarations`): **Automation** → **API Reference** → export icon
→ **TypeScript** format saves `OmniFocus.ts` to Downloads. Its first line names the version too (or check **OmniFocus →
About OmniFocus**), then:

```bash
mv ~/Downloads/OmniFocus.ts src/omnifocus/api/OmniFocus-[VERSION]-d.ts
```

### Step 2: Version and Archive

1. Apply the manual carry-overs to the new file (see the numbered list above): the regen-instructions header block (copy
   from the previous snapshot's top comment, updating the "Generated via" line), then the optional-before-required
   normalization. `npx tsc --noEmit -p tsconfig.json` reports any TS1016 site you missed.

2. Retarget the symlink and apply the retention convention (keep current + previous, delete N-2):
   ```bash
   cd src/omnifocus/api
   ln -sfn OmniFocus-[VERSION]-d.ts OmniFocus.d.ts
   git rm OmniFocus-[N-2_VERSION]-d.ts
   ```
   (`OmniFocus.d.ts` is a symlink — never `git mv` it to "archive" anything.)

### Step 3: Update Documentation

1. Update the version information at the top of this README
2. Check for new API features by comparing versions with a class/member-name diff (see **Diffing two snapshots** above —
   line-based and sorted-line diffs are noise)
3. Document any new features or breaking changes — and skim the OmniFocus release notes
   (omnigroup.com/releasenotes/omnifocus) for Omni Automation entries: BEHAVIORAL changes ship with identical type
   signatures and are invisible to any typings diff
4. Update references in code that use version-specific features

### Step 4: Test and Verify

1. Run `npm run ci:local`: format check, build, typecheck, lint, unit tests, then three live checks against the built
   server (startup, tool registration, and a `system version` tool call) — so the vendored types are exercised by a real
   server boot, not only by `tsc`
2. Test any scripts that use new API features

### Step 5: Commit Changes

```bash
git add src/omnifocus/api/
git commit -m "feat: update OmniFocus API definitions to version [VERSION]"
```

## Version History

- **4.9** - Current version (September 2026; build 187.2.1, exported 2026-09-15 on macOS 27)
  - New: `Application.getTypeScriptDeclarations(filterString?)` — the export itself is now an API call
  - New: `LanguageModel.Tool` class; `LanguageModel.Session.withTools()` now takes `Array<LanguageModel.Tool>` (replaces
    the undocumented `_omnijs_AnonymousProxy`)
  - New: `PlugIn.Action.image` (readonly), `URL.revealFile()`
  - No changes to Task, Project, Tag, Folder, Database, or any enum. Optional parameters are now marked `?:`
  - Behavioral (release-notes layer, NOT visible in typings): Apple Intelligence date-parsing fallback (beta, UI only);
    Siri AI (beta); monthly repeat "Next to Last"/"Day" options (UI only). 4.8.13 shipped no automation changes
- **4.8.11** - Previous version (May 2026, regenerated June 2026)
  - API-identical to 4.8.6 (verified by sorted-content diff) — maintenance releases only
  - Behavioral (release-notes layer, NOT visible in typings): 4.8.9 enforces mutually exclusive tags in Omni Automation;
    4.8.10 fixed an Automation note-text crash; 4.8.11 fixed an Automation link-style regression
- **4.8.6** - (December 2025; file retired under the keep-two rule)
  - New: LanguageModel API for AI integration
  - New: FolderArray, ProjectArray, SectionArray, TagArray typed arrays
  - New: Library class
- **4.7.0** - Minimum required version (August 2025)
  - Required for: planned dates, mutually exclusive tags, enhanced repeats

## Integration with MCP Bridge

The MCP bridge uses these definitions as a reference for:

- Correct method signatures
- Available properties and methods
- Type safety in our TypeScript code
- Understanding OmniFocus object relationships
- Version-specific feature detection

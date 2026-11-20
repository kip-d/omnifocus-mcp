# OmniFocus API TypeScript Definitions

This directory contains the official TypeScript definitions for OmniFocus automation.

## Current Version: OmniFocus.d.ts → OmniFocus-4.10.1-d.ts

- **Current**: `OmniFocus.d.ts` (symlink to latest version)
- **Latest Version**: OmniFocus 4.10.1
- **Previous Version**: OmniFocus 4.9 (kept for reference)
- **Minimum Required**: OmniFocus 4.7+
- **Drift note**: 4.9 → 4.10.1 has no member changes (verified 2026-11-20 by `npm run api:regen`'s member diff): see
  Version History. The regenerate-and-diff step is the platform-drift signal for the OMN-148 behavioral spec (its
  platform-contract source).

## File Structure

- `OmniFocus.d.ts` - Symlink to the current version (always points to latest)
- `OmniFocus-4.10.1-d.ts` - Official TypeScript definitions for OmniFocus 4.10.1
- `OmniFocus-4.9-d.ts` - TypeScript definitions for OmniFocus 4.9 (previous)
- `OmniFocus-extensions.d.ts` - Undocumented but working properties (empirically verified)

### What the regen script does to the raw export

`scripts/regen-api-snapshot.ts` applies these to the raw export; nothing is hand-edited.

1. **Header block.** Inserts the regen-instructions comment after the export's two-line banner.
2. **Optional-before-required normalization.** The export marks a parameter `?:` whenever it accepts `null`, even when a
   required parameter follows it. TypeScript's grammar rejects that (TS1016). Saved as a real `.d.ts` with
   `skipLibCheck` (tsc's default, and set in this repo's `tsconfig`) the export compiles clean — but this directory's
   versioned files are named `OmniFocus-X.Y-d.ts`, and hyphen-d is not a declaration file, so `skipLibCheck` does not
   cover them and `npm run build` fails. The script parses each parameter list (splitting on top-level commas, so nested
   parentheses, brackets and generics are safe), finds the last required parameter, and drops the `?` from every
   optional parameter before it; the type stays `T | null`, so nothing is lost. The export has carried the same sites
   since 4.9; this table is a snapshot of what 4.10.1 needed, not a checklist:

   | Declaration                              | Parameter(s) losing `?` | Required parameter that follows |
   | ---------------------------------------- | ----------------------- | ------------------------------- |
   | `Application.openDocument`               | `from`                  | `url`, `completed`              |
   | `FileWrapper.withContents`               | `name`                  | `contents`                      |
   | `FileWrapper.withChildren`               | `name`                  | `children`                      |
   | `Form.Field.MultipleOptions` constructor | `displayName`, `names`  | `options`, `selected`           |
   | `Form.Field.Option` constructor          | `displayName`           | `options`                       |
   | `LanguageModel.Tool` constructor         | `inputSchema`           | `f`                             |
   | `Settings.setObjectForKey`               | `value`                 | `key`                           |

3. **Prettier.** Formats the result with the repo's prettier config (4-space to 2-space indents, wrapped signatures), so
   the committed file is what `npm run format:check` and the pre-commit hook expect. The script's output is byte-stable
   apart from the export's own `Generated on` timestamp line.
4. **Symlink and retention.** Writes `OmniFocus-<version>-d.ts`, repoints `OmniFocus.d.ts`, and deletes snapshots older
   than the previous one (the keep-two rule: current plus previous).

### Diffing two snapshots

The script prints the class/member diff against the previous snapshot on every run. The differ
(`scripts/lib/api-snapshot.ts`) works on a token stream, never on lines: it strips `//` comments, collapses whitespace,
ignores `?` markers, then splits on `;` `{` `}` while tracking a container stack. Indentation, wrapping and prettier
formatting therefore produce no diff; a changed signature shows as one removal plus one addition.

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
version. It is a JXA script: under plain `node` it exits 0 with no output, because JXA's `run()` entry point is never
invoked — a silent no-op, not a failure, so check that the property lines actually printed.

## How to Regenerate API Definitions

When a new version of OmniFocus is released, run the script. It is the procedure.

```bash
npm run api:regen                          # exports from the running OmniFocus (JXA bridge)
npm run api:regen -- --from <raw-export>   # offline: use a saved export instead
npm run api:regen -- --api-dir <dir>       # write somewhere other than this directory
```

OmniFocus must be running for the live form. The version comes from the export's first line, so there is nothing to name
by hand. Older OmniFocus (before 4.9, no `getTypeScriptDeclarations`) can save **Automation** → **API Reference** →
export icon → **TypeScript**, then pass the saved file with `--from`.

After the run:

1. Read the printed member diff. A clean run reports `No member changes.`; anything else is an API change to document.
2. `npx tsc --noEmit -p tsconfig.json` (the acceptance check), then `npm run ci:local`: format check, build, typecheck,
   lint, unit tests, and three live checks against the built server, so the vendored types are exercised by a real
   server boot, not only by `tsc`.
3. Run the integration suite, which `ci:local` skips: `npm run test:integration` (long-running, against live OmniFocus;
   run it in the background, see `tests/integration/PERFORMANCE.md`). A vendored-types change is exactly where a real
   OmniFocus behavioral mismatch surfaces only here.
4. Update the version block at the top of this README and add a Version History entry. Skim the OmniFocus release notes
   (omnigroup.com/releasenotes/omnifocus) for Omni Automation entries: BEHAVIORAL changes ship with identical type
   signatures and are invisible to any typings diff.
5. Update references in code that use version-specific features, then commit `src/omnifocus/api/`.

`OmniFocus.d.ts` is a symlink — never `git mv` it to "archive" anything.

## Version History

- **4.10.1** - Current version (November 2026; build 190.2, exported 2026-11-20 on macOS 27.0.1)
  - No member changes from 4.9 (class/member diff, `npm run api:regen`); the new file differs from 4.9 only in the
    export banner and header comment
  - Same seven optional-before-required sites as 4.9, now normalized by the script instead of by hand
  - Behavioral (release-notes layer, NOT visible in typings): reviewed 2026-11-20 across 4.9.1, 4.9.2, 4.9.3 and 4.10.1
    (there is no 4.10.0 entry). No automation, plug-in, repetition, tag, perspective or project-review bullets. The
    changes are Shortcuts tweaks, Apple Intelligence and Siri date-parsing fixes (both beta), sync hang and crash fixes,
    and a Dates & Times Settings crash fix. No mention of an official Omni MCP server.
- **4.9** - Previous version (September 2026; build 187.2.1, exported 2026-09-15 on macOS 27)
  - New: `Application.getTypeScriptDeclarations(filterString?)` — the export itself is now an API call
  - New: `LanguageModel.Tool` class; `LanguageModel.Session.withTools()` now takes `Array<LanguageModel.Tool>` (replaces
    the undocumented `_omnijs_AnonymousProxy`)
  - New: `PlugIn.Action.image` (readonly), `URL.revealFile()`
  - No changes to Task, Project, Tag, Folder, Database, or any enum. Optional parameters are now marked `?:`
  - Behavioral (release-notes layer, NOT visible in typings): Apple Intelligence date-parsing fallback (beta, UI only);
    Siri AI (beta); monthly repeat "Next to Last"/"Day" options (UI only). 4.8.13 shipped no automation changes
- **4.8.11** - (May 2026, regenerated June 2026; file retired under the keep-two rule)
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

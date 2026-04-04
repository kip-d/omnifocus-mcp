# Session Handoff — 2026-04-03

## Context

SonarJS was adopted via a 3-PR chain (#53, #54, #55) and merged to main. Cognitive complexity threshold was tightened
from 25 to 20 post-merge. The codebase now has 43 warnings (0 errors) that need systematic resolution.

## Current State

**Branch**: `main` at commit `f2e6f95` **Version**: 4.1.0 **All tests pass**: 1634 unit, 73 integration

## Remaining Work

### 1. Cognitive Complexity (17 functions over threshold 20)

Ranked by severity — tackle top-down:

| File                                              | Line | Score  | Notes                                      |
| ------------------------------------------------- | ---- | ------ | ------------------------------------------ |
| `src/tools/unified/compilers/QueryCompiler.ts`    | 83   | **48** | Worst — big switch translating query types |
| `src/contracts/ast/script-builder.ts`             | 923  | **33** | Script generation function                 |
| `src/utils/cli.ts`                                | 28   | **32** | CLI arg parsing                            |
| `src/contracts/ast/script-builder.ts`             | 290  | **30** | Script generation function                 |
| `src/tools/unified/OmniFocusAnalyzeTool.ts`       | 737  | **30** | Analytics handler                          |
| `src/contracts/ast/filter-generator.ts`           | 218  | **27** | Filter pipeline                            |
| `src/tools/unified/OmniFocusWriteTool.ts`         | 1705 | **27** | Write handler                              |
| `src/tools/unified/compilers/AnalysisCompiler.ts` | 77   | **27** | Compiler switch                            |
| `src/tools/unified/OmniFocusWriteTool.ts`         | 602  | **26** | Write handler                              |
| `src/tools/unified/OmniFocusWriteTool.ts`         | 898  | **25** | Write handler                              |
| `src/tools/unified/utils/task-sanitizer.ts`       | 58   | **24** | Date sanitization                          |
| `src/tools/unified/OmniFocusAnalyzeTool.ts`       | 2320 | **23** | Analytics handler                          |
| `src/utils/response-format.ts`                    | 348  | **23** | Response builder                           |
| `src/tools/unified/OmniFocusAnalyzeTool.ts`       | 1472 | **22** | Analytics handler                          |
| `src/tools/unified/OmniFocusWriteTool.ts`         | 1480 | **22** | Write handler                              |
| `src/utils/response-format.ts`                    | 181  | **22** | Response builder                           |
| `src/tools/base.ts`                               | 219  | **21** | Base tool class                            |

### 2. Slow Regex (6 — ReDoS risk, fix regardless)

All in `src/tools/unified/OmniFocusAnalyzeTool.ts`:

- Lines 2402, 2405, 2423, 2529, 2531
- Plus 1 in `src/http-server.ts` line 192

### 3. Different-Types Comparison (7 — potential bugs)

These are `!==` or `===` checks that SonarJS says will always be true/false due to type mismatch. Worth investigating —
could be actual bugs:

- `OmniFocusAnalyzeTool.ts`: lines 521, 524, 1893, 2006, 2021
- `OmniAutomation.ts`: line 376
- `response-format.ts`: line 255
- `logger.ts`: line 48

### 4. Other Warnings (low priority)

- `Server` deprecated (7 occurrences) — can't fix until MCP SDK supports hand-crafted inputSchema on McpServer.
  Documented in PR #51.
- `no-alphabetical-sort` (2) in script-builder — use `localeCompare`
- `includeCompleted` deprecated in filters.ts — our own deprecation

## Refactoring Strategy

PR #55 established the pattern — extract helpers, use `{ isError, response }` union returns for early-exit paths, DRY
repeated blocks. Follow the same approach.

**Suggested order:**

1. Fix slow-regex (6 fixes, high value, low risk)
2. Investigate different-types-comparison (7 fixes, could be bugs)
3. QueryCompiler.ts at 48 (worst complexity offender)
4. script-builder.ts (two functions at 33 and 30)
5. cli.ts at 32
6. Remaining WriteTool/AnalyzeTool functions

**After each batch**: run `npm run build && npm run test:unit` to verify. Run `npm run test:integration` after touching
WriteTool, AnalyzeTool, or script-builder (anything in the execution path).

## Linear Tracking

- **OMN-36**: Evaluate SonarJS eslint-plugin for codebase (Backlog) — parent issue
- **OMN-37**: Auto-diagnose MCP tool failures via PostToolUse hook (Backlog) — separate initiative

## ESLint Config

`eslint.config.js` — SonarJS rules with tuned overrides. Key decisions:

- `cognitive-complexity`: warn at 20
- `pseudo-random`: off (nonces only)
- `no-os-command-from-path`: off (osascript expected)
- `code-eval`: off (JXA evaluateJavascript)
- `void-use`: off (fire-and-forget)
- Test files exempt from complexity rules

## Goal

Get to `--max-warnings=0` so all warnings block commits. Current: 43 warnings. Target: 0.

# Repository Guidelines

## Project Structure & Module Organization

- `src/`: TypeScript source. Key areas: `tools/unified/` (4 unified MCP tools), `prompts/` (built-in prompts),
  `omnifocus/` (OmniAutomation bridges and scripts), `utils/`, `cache/`. Entry: `src/index.ts` (bin:
  `omnifocus-mcp-cached`).
- `tests/`: `unit/` (Vitest), `integration/`, `performance/`, `manual/`, plus shared `support/` and `utils/`.
- `scripts/`: maintenance and local CI helpers. Build output goes to `dist/`.

## Build, Test, and Development Commands

- `npm run dev`: TypeScript watch build for local development.
- `npm run build`: Compile to `dist/` with `tsc`.
- `npm start`: Run compiled MCP server (`node dist/index.js`).
- `npm test`: Run unit tests in `tests/unit` (Vitest).
- `npm run test:integration`: Run CLI/integration tests (requires macOS + OmniFocus permissions).
- `npm run test:performance`: Benchmarks and perf tests.
- `npm run test:coverage`: Generate coverage (text, HTML, json-summary).
- `npm run lint` | `lint:fix`: Lint TypeScript (`eslint src`), auto-fix common issues.
- `npm run typecheck`: Strict type checking without emit.
- `npm run cleanup:test-data`: Remove temp artifacts created by tests.

## Coding Style & Naming Conventions

- **Language/Module**: TypeScript (ES2022, ESM). Node >= 18.
- **Indentation**: 2 spaces. **Quotes**: single. **Semicolons**: required. **Trailing commas**: multiline.
- **Naming**: camelCase functions/values; PascalCase classes/types; file names kebab-case where practical (PascalCase
  allowed for class-centric files).
- **Linting**: ESLint + `@typescript-eslint` (see `eslint.config.js`). Use `npm run lint` before PRs.
- **TS config**: strict mode on (`tsconfig.json`), tests excluded from build; prefer explicit types for public APIs.

## Testing Guidelines

- **Framework**: Vitest. Unit tests live in `tests/unit` and use `*.test.ts`.
- **Coverage thresholds** (see `vitest.config.ts`): branches 75%, functions 80%, lines 85%, statements 85%.
- **Integration**: `tests/integration` exercises OmniFocus; grant macOS Automation permissions and close OmniFocus if
  instructed. Clean with `npm run cleanup:test-data` when needed.

## Commit & Pull Request Guidelines

- **Commits**: Conventional Commits (e.g., `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`). Keep messages imperative
  and scoped when helpful.
- **PRs**: include clear description, linked issues, test plan (`npm test`/coverage output), and any perf impact. Update
  docs when changing tools/prompts or public types. PRs must pass `lint`, `typecheck`, and all CI tests.

## Unified API (v3.0.0+)

The server exposes 4 unified MCP tools that consolidate all functionality:

| Tool                | Purpose                       |
| ------------------- | ----------------------------- |
| `omnifocus_read`    | All query operations          |
| `omnifocus_write`   | Create/update/complete/delete |
| `omnifocus_analyze` | Analytics and analysis        |
| `system`            | Version info and diagnostics  |

Run via `omnifocus-mcp-cached` (after build) or `npm start`. Do not commit real OmniFocus data; tests use mocks where
possible.

## Agent/MCP Notes

- **Read First**: Review `CLAUDE.md` for comprehensive development guidance and `docs/dev/LESSONS_LEARNED.md` before
  architectural changes.
- **Unified tools**: Located in `src/tools/unified/`. Official OmniFocus types in `src/omnifocus/api/OmniFocus.d.ts`.
- **MCP lifecycle (stdin)**: Servers must exit when stdin closes. Keep these handlers in `src/index.ts` (do not remove):

  ```ts
  process.stdin.on('end', () => process.exit(0));
  process.stdin.on('close', () => process.exit(0));
  ```

- **Parameter coercion (Claude Desktop bridge)**: Claude Desktop stringifies all params. In Zod schemas, use the
  coercion helpers instead of raw `z.number()`/`z.boolean()`:

  ```ts
  import { coerceNumber, coerceBoolean } from '../schemas/coercion-helpers.js';
  const Schema = z.object({
    limit: coerceNumber().int().min(1).max(200).default(25),
    includeDetails: coerceBoolean().default(false),
  });
  ```

- **Date/time inputs**: Use `YYYY-MM-DD` or `YYYY-MM-DD HH:mm` (local time). Smart defaults:
  - Due dates: date-only -> 5:00 PM local
  - Defer dates: date-only -> 8:00 AM local
  - Avoid `Z`-suffixed UTC inputs (timezone confusion)

- **JXA performance rules**:
  - Never use `.where()`/`.whose()` on OmniFocus collections
  - Iterate arrays with plain JS loops and early exits
  - Prefer direct `try/catch` over heavy wrappers

- **Script helpers**: Use `getUnifiedHelpers()` from `src/omnifocus/scripts/shared/helpers.ts` for script injection.

- **Testing patterns (MCP/stdio)**:

  ```bash
  echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
  ```

  Success: tool logs + graceful exit. Failure: error JSON present.

- **Docs archiving**: Don't delete docs; move obsolete files to `.archive/` with rationale.

- **Quality bar**: Solve the exact problem with minimal code, maintain existing patterns, ensure changes are immediately
  runnable and testable.

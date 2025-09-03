# Repository Guidelines

## Project Structure & Module Organization
- `src/`: TypeScript source. Key areas: `tools/` (MCP tools), `prompts/` (built‑in prompts), `omnifocus/` (OmniAutomation bridges and scripts), `utils/`, `cache/`. Entry: `src/index.ts` (bin: `omnifocus-mcp-cached`).
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
- `npm run lint` | `lint:fix`: Lint TypeScript (`eslint src`), auto‑fix common issues.
- `npm run typecheck`: Strict type checking without emit.
- `npm run cleanup:test-data`: Remove temp artifacts created by tests.

## Coding Style & Naming Conventions
- **Language/Module**: TypeScript (ES2022, ESM). Node ≥ 18.
- **Indentation**: 2 spaces. **Quotes**: single. **Semicolons**: required. **Trailing commas**: multiline.
- **Naming**: camelCase functions/values; PascalCase classes/types; file names kebab‑case where practical (PascalCase allowed for class‑centric files).
- **Linting**: ESLint + `@typescript-eslint` (see `eslint.config.js`). Use `npm run lint` before PRs.
- **TS config**: strict mode on (`tsconfig.json`), tests excluded from build; prefer explicit types for public APIs.

## Testing Guidelines
- **Framework**: Vitest. Unit tests live in `tests/unit` and use `*.test.ts`.
- **Coverage thresholds** (see `vitest.config.ts`): branches 75%, functions 80%, lines 85%, statements 85%.
- **Integration**: `tests/integration` exercises OmniFocus; grant macOS Automation permissions and close OmniFocus if instructed. Clean with `npm run cleanup:test-data` when needed.

## Commit & Pull Request Guidelines
- **Commits**: Conventional Commits (e.g., `feat: …`, `fix: …`, `docs: …`, `chore: …`). Keep messages imperative and scoped when helpful.
- **PRs**: include clear description, linked issues, test plan (`npm test`/coverage output), and any perf impact. Update docs when changing tools/prompts or public types. PRs must pass `lint`, `typecheck`, and all CI tests.

## Agent/MCP Notes
- The server speaks MCP over stdio. Run via `omnifocus-mcp-cached` (after build) or `npm start`. Do not commit real OmniFocus data; tests use mocks where possible.

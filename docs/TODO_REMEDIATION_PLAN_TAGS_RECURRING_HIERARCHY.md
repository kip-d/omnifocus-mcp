# OmniFocus MCP Remediation TODO (2025-09-15)

## Tag Visibility Reliability
- [ ] Reproduce issue with regression test chaining `manage_task` tag assignment and immediate `tasks` queries (unit + integration coverage).
- [ ] Audit `safeGetTags` usage; switch to bridge-based fetch or re-fetch task objects post-tag updates where needed.
- [ ] Tighten cache invalidation for tag-related task keys and surface warnings when OmniFocus reports missing tag applications.

## Recurring Task Coverage
- [ ] Restore minimal repeat-rule support in create flow without exceeding script size limits.
- [ ] Invalidate recurring analytics cache when repeat rules change during create/update operations.
- [ ] Add integration test ensuring newly created recurring tasks appear in `recurring_tasks` (`analyze` + `patterns`).

## Hierarchy Reliability
- [ ] Extend integration coverage to assert parent/child metadata in `list_tasks` results.
- [ ] Harden reparenting fallbacks and return metadata confirmations from update scripts.
- [ ] Ensure cache invalidation covers parent-child changes across task modes.

## Documentation & UX Follow-ups
- [ ] Expand compact syntax guide with tag, recurrence, and hierarchy examples.
- [ ] Document propagation delays and troubleshooting tips for tags/recurrence issues in `docs/TROUBLESHOOTING.md`.

## Analytics Data Readiness
- [ ] Provide guidance for seeding historical completion data to unlock analytics insights.
- [ ] Add diagnostic messaging in `recurring_tasks` when datasets are too sparse.

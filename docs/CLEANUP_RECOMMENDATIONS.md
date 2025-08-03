# Repository Cleanup Recommendations

## Files to Remove (Outdated/One-time Notifications)

### 1. Old Release/Notification Files
- `RELEASE_NOTES_v1.4.0.md` - Old release notes (current version is 1.6.0)
- `HOTFIX_NOTIFICATION.md` - One-time notification about a resolved build issue
- `USER_TEST_NOTIFICATION.md` - Old testing notification for v1.4.0

### 2. Outdated Documentation in `/docs`
- `prompt-cache-architecture.md` - This is a Claude Code prompt to build from scratch (not needed)
- `prompt-plugin-architecture.md` - Another build-from-scratch prompt (not needed)
- `ABANDONED_APPROACHES.md` - While educational, this could move to a wiki or separate dev docs
- `JXA_LEARNING_JOURNEY.md` - Personal learning notes that could be archived
- `api-migration-summary.md` - Migration is complete, no longer needed

### 3. Old Test Files
Many unit tests appear to be for specific bug fixes that are now resolved:
- `tests/unit/bug-fixes-unit.test.ts`
- `tests/unit/bug2-inbox-assignment.test.ts`
- `tests/unit/id-extraction-bug.test.ts`
- `tests/unit/mock-id-extraction.test.ts`
- `tests/unit/null-object-fix.test.ts`
- `tests/unit/verify-id-fix.test.ts`

### 4. Test Result Archives
- `docs/V1.5.0-TEST-RESULTS.md` - Old test results
- `docs/test-results-analysis.md` - Old analysis

### 5. Redundant Issue Templates
The `.github/ISSUE_TEMPLATE` directory has 9 templates, but many are actually implementation proposals that have been moved to `docs/proposals/`:
- `01-testing-infrastructure.md` - Generic template
- `02-security-enhancement.md` - Generic template  
- `03-error-handling.md` - Generic template
- `06-mcp-resources.md` - Already copied to proposals
- `07-mcp-prompts.md` - Already copied to proposals
- `09-consent-mechanisms.md` - Already copied to proposals

## Files to Consolidate

### 1. JXA Documentation
Multiple overlapping JXA docs could be consolidated into one comprehensive guide:
- `JXA-NULL-MISSING-VALUE-EXPLANATION.md`
- `JXA-WHOSE-LIMITATIONS.md`
- `JXA-WHOSE-OPERATORS-DEFINITIVE.md`
- `JXA-WHOSE-WORKAROUNDS.md`
- `JXA_COMPREHENSIVE_REFERENCE.md`
- `JXA_API_DISCOVERY.md`
- `WHOSE-FINDINGS-SUMMARY.md`

Consolidate into: `JXA-COMPLETE-GUIDE.md`

### 2. MCP Documentation
- `MCP-COMPLIANCE-GAPS.md`
- `MCP-IMPROVEMENTS.md`
- `MCP_RESOURCES_AND_PROMPTS_PROPOSAL.md` (duplicate of proposals)

Consolidate into existing proposals or main docs.

## Files to Keep But Update

### 1. Main Documentation
- `README.md` - Remove references to old versions
- `CHANGELOG.md` - Keep all entries but could archive pre-1.5.0
- `CONTRIBUTING.md` - Update with current practices

### 2. Essential Developer Docs
- `CLAUDE.md` - Keep and maintain
- `architecture-decisions.md` - Keep as historical record
- `PERMISSIONS.md` - Essential for users
- `claude-desktop-config.md` - Essential setup guide

## Recommendations

1. **Create an `archive/` directory** for historical docs that might be useful later
2. **Consolidate JXA documentation** into one comprehensive guide
3. **Remove outdated test files** that test already-fixed bugs
4. **Clean up issue templates** to only keep the generic ones
5. **Update README.md** to remove references to old versions and completed features

## Size Impact

Removing these files would:
- Reduce repository size by approximately 200-300KB
- Make documentation easier to navigate
- Reduce confusion about which docs are current
- Simplify the test suite to focus on regression prevention

## Implementation Priority

1. **High Priority**: Remove old notifications and release notes
2. **Medium Priority**: Consolidate JXA documentation
3. **Low Priority**: Archive old test files and learning journey docs
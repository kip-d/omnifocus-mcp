# Documentation Reorganization Plan

## Current State Analysis
We have 100+ markdown files scattered across the root and various directories, mixing:
- Active user documentation
- Development journey/history
- Test results and session notes
- Experimental research
- Failed approaches
- Proposals and ideas

## Proposed Structure

### Phase 1: Create Directory Structure
```
docs/
├── README.md                    # Main documentation hub
├── user/                        # End-user documentation
│   ├── INSTALLATION.md          # Setup and configuration
│   ├── QUICK_START.md           # Getting started guide
│   ├── API_REFERENCE.md         # Tool reference
│   ├── TROUBLESHOOTING.md       # Common issues
│   └── FAQ.md                   # Frequently asked questions
│
├── development/                 # Active development docs
│   ├── ARCHITECTURE.md          # System design
│   ├── CONTRIBUTING.md          # Contribution guide
│   ├── TESTING.md               # Test strategy
│   ├── PERFORMANCE.md           # Performance guidelines
│   ├── SCRIPT_LENGTH_SOLUTION.md # Script size management (✓ created)
│   ├── CODING_STANDARDS.md      # Code style guide
│   └── RELEASE_PROCESS.md       # How to release
│
└── journey/                     # Historical/learning docs
    ├── README.md                # Index of journey docs
    ├── performance/             # Performance evolution
    │   ├── BREAKTHROUGH.md      # The 25s to 2s journey
    │   ├── WHOSE_METHOD.md      # Discovery of whose() issues
    │   └── OPTIMIZATIONS.md    # Various optimization attempts
    ├── technical/               # Technical discoveries
    │   ├── JXA_LEARNINGS.md     # JXA gotchas and solutions
    │   ├── BRIDGE_DISCOVERY.md  # evaluateJavascript findings
    │   ├── TAG_VISIBILITY.md    # Tag consistency saga
    │   └── SCRIPT_SIZE.md       # 51KB crisis and solution
    └── sessions/                # Development session notes
        ├── SESSION_v2.0.0.md    # Final v2 release session
        └── [other sessions]     # Historical sessions

archive/                         # Deprecated/abandoned content
├── experimental/                # Failed experiments
├── old-versions/                # Pre-v2 documentation
└── test-results/                # Historical test results
```

### Phase 2: File Movement Plan

#### Keep in Root (Essential Files)
- README.md - Main project readme
- CHANGELOG.md - Version history
- CONTRIBUTING.md - Contribution guidelines  
- LICENSE - Legal
- CLAUDE.md - Claude Code instructions
- TODO_NEXT_SESSION.md - Active work tracking

#### Move to docs/user/
- Current API documentation
- Installation guides
- Troubleshooting guides
- User-facing feature docs

#### Move to docs/development/
- ARCHITECTURE.md
- CODING_STANDARDS.md
- Testing guides
- Performance docs
- Technical implementation details

#### Move to docs/journey/
- All V1.x.x version analysis files
- PERFORMANCE_*.md files
- Test result summaries
- Session context files
- Research findings (HYBRID_*, EVALUATEJAVASCRIPT_*, etc.)

#### Move to archive/
- All files with "ABANDONED", "OLD", "DEPRECATED" 
- Failed optimization attempts
- Outdated test prompts
- Superseded documentation

### Phase 3: Documentation Updates

#### Create New Index Files
1. **docs/README.md** - Documentation hub with links to all sections
2. **docs/journey/README.md** - Chronological index of development journey
3. **archive/README.md** - Explanation of archived content

#### Update Existing Files
1. Update all internal links to reflect new paths
2. Add deprecation notices to archived files
3. Add "Last Updated" dates to active documentation

### Phase 4: Implementation Steps

1. **Create directory structure**
   ```bash
   mkdir -p docs/user docs/development docs/journey/performance
   mkdir -p docs/journey/technical docs/journey/sessions
   mkdir -p archive/experimental archive/old-versions archive/test-results
   ```

2. **Move files in batches** (with git mv to preserve history)
   - Start with journey docs (least disruptive)
   - Then archived content
   - Finally reorganize active docs

3. **Update references**
   - Update CLAUDE.md to point to new locations
   - Update README.md with new structure
   - Fix any broken links

4. **Create index files**
   - Write comprehensive indexes for each section
   - Add navigation breadcrumbs

## Benefits of This Organization

1. **Clear Separation**: Users vs developers vs historical interest
2. **Easy Navigation**: Logical grouping by purpose
3. **Preservation**: Journey docs tell the story without cluttering active docs
4. **Maintainability**: Clear where new docs should go
5. **Discoverability**: Indexes and proper structure help find information

## Files to Handle Specially

### High-Value Journey Documents (Preserve in docs/journey/)
- PERFORMANCE_BREAKTHROUGH.md - The 25s to 2s optimization story
- DEBUG_UPDATE_TASK_BISECT.md - Debugging the 51KB script issue
- FIX_TAG_VISIBILITY.md - Solving tag consistency
- V2_COMPREHENSIVE_FINAL_TEST.md - The path to 100% test pass rate

### Active Development Guides (Move to docs/development/)
- SCRIPT_LENGTH_SOLUTION.md (already created)
- CODING_STANDARDS.md
- Testing protocols
- Architecture decisions

### User-Facing (Move to docs/user/)
- API references
- Installation guides
- Troubleshooting guides
- GTD workflow documentation

## Next Steps

1. Review and approve this plan
2. Create directory structure
3. Start moving files in small batches
4. Update cross-references
5. Create comprehensive indexes
6. Update CLAUDE.md with new locations

This reorganization will make the project more professional and easier to navigate while preserving the valuable development history that got us here.
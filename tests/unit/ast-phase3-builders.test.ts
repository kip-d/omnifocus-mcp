/**
 * Unit tests for Phase 3 AST builders - Projects and Tags
 *
 * Tests for:
 * - ProjectFilter and generateProjectFilterCode
 * - buildFilteredProjectsScript
 * - TagQueryOptions and buildTagsScript
 */

import { describe, it, expect } from 'vitest';
import {
  generateProjectFilterCode,
  isEmptyProjectFilter,
  describeProjectFilter,
} from '../../src/contracts/ast/filter-generator.js';
import { buildFilteredProjectsScript, buildProjectByIdScript } from '../../src/contracts/ast/script-builder.js';
import { buildTagsScript, buildActiveTagsScript } from '../../src/contracts/ast/tag-script-builder.js';
import type { ProjectFilter } from '../../src/contracts/filters.js';
import type { TagQueryOptions } from '../../src/contracts/tag-options.js';

describe('Phase 3 AST Builders', () => {
  describe('ProjectFilter code generation', () => {
    it('should generate true for empty filter', () => {
      const filter: ProjectFilter = {};
      const code = generateProjectFilterCode(filter);
      expect(code).toBe('true');
    });

    it('should generate status filter for single status', () => {
      const filter: ProjectFilter = { status: ['active'] };
      const code = generateProjectFilterCode(filter);
      expect(code).toContain('Project.Status.Active');
    });

    it('should generate status filter for multiple statuses', () => {
      const filter: ProjectFilter = { status: ['active', 'onHold'] };
      const code = generateProjectFilterCode(filter);
      expect(code).toContain('Project.Status.Active');
      expect(code).toContain('Project.Status.OnHold');
      expect(code).toContain('||');
    });

    it('should generate flagged filter', () => {
      const filter: ProjectFilter = { flagged: true };
      const code = generateProjectFilterCode(filter);
      expect(code).toContain('project.flagged === true');
    });

    it('should generate text search filter', () => {
      const filter: ProjectFilter = { text: 'test project' };
      const code = generateProjectFilterCode(filter);
      expect(code).toContain('toLowerCase()');
      expect(code).toContain('test project');
    });

    // OMN-142: name is name-scoped — must never read project.note (text does that)
    it('should generate name-only filter without touching project.note', () => {
      const filter: ProjectFilter = { name: 'review' };
      const code = generateProjectFilterCode(filter);
      expect(code).toContain('project.name');
      expect(code).toContain('review');
      expect(code).not.toContain('project.note');
    });

    it('should generate regex name filter for MATCHES, still name only', () => {
      const filter: ProjectFilter = { name: '^Q[1-4]', nameOperator: 'MATCHES' };
      const code = generateProjectFilterCode(filter);
      expect(code).toContain('project.name');
      expect(code).toContain('new RegExp');
      expect(code).toContain('^Q[1-4]');
      expect(code).not.toContain('project.note');
    });

    it('should generate folder ID filter', () => {
      const filter: ProjectFilter = { folderId: 'abc123' };
      const code = generateProjectFilterCode(filter);
      expect(code).toContain('project.parentFolder');
      expect(code).toContain('abc123');
    });

    it('should generate folder name filter', () => {
      const filter: ProjectFilter = { folderName: 'Work' };
      const code = generateProjectFilterCode(filter);
      expect(code).toContain('project.parentFolder');
      expect(code).toContain('toLowerCase()');
    });

    // OMN-96: top-level-only means "no containing folder" → !project.parentFolder
    it('should generate top-level-only filter', () => {
      const filter: ProjectFilter = { topLevelOnly: true };
      const code = generateProjectFilterCode(filter);
      expect(code).toContain('!project.parentFolder');
    });

    it('should combine multiple filters with AND', () => {
      const filter: ProjectFilter = { status: ['active'], flagged: true };
      const code = generateProjectFilterCode(filter);
      expect(code).toContain('&&');
    });

    // OMN-171 (S3): OR branches compile to a ||-joined group of recursive predicates
    it('should generate OR branches joined with ||', () => {
      const filter: ProjectFilter = {
        orBranches: [{ flagged: true }, { status: ['active'] }],
      };
      const code = generateProjectFilterCode(filter);
      expect(code).toContain('project.flagged === true');
      expect(code).toContain('Project.Status.Active');
      expect(code).toContain('||');
    });

    it('should AND base conditions with the OR group', () => {
      const filter: ProjectFilter = {
        flagged: true,
        orBranches: [{ status: ['active'] }, { status: ['done'] }],
      };
      const code = generateProjectFilterCode(filter);
      // base flagged AND (branch1 || branch2)
      expect(code).toContain('project.flagged === true');
      expect(code).toContain('&&');
      expect(code).toContain('||');
      expect(code).toContain('Project.Status.Active');
      expect(code).toContain('Project.Status.Done');
    });

    it('should emit a single OR branch without a || operator', () => {
      const filter: ProjectFilter = { orBranches: [{ flagged: true }] };
      const code = generateProjectFilterCode(filter);
      expect(code).toContain('project.flagged === true');
      expect(code).not.toContain('||');
    });
  });

  describe('isEmptyProjectFilter', () => {
    it('should return true for empty filter', () => {
      expect(isEmptyProjectFilter({})).toBe(true);
    });

    it('should return true for filter with only pagination', () => {
      expect(isEmptyProjectFilter({ limit: 10, offset: 0 })).toBe(true);
    });

    it('should return false for filter with status', () => {
      expect(isEmptyProjectFilter({ status: ['active'] })).toBe(false);
    });

    it('should return false for filter with flagged', () => {
      expect(isEmptyProjectFilter({ flagged: true })).toBe(false);
    });

    // OMN-142: a name filter is a real constraint
    it('should return false for filter with name', () => {
      expect(isEmptyProjectFilter({ name: 'review' })).toBe(false);
    });

    // OMN-96: topLevelOnly is a real constraint, so the filter isn't empty
    it('should return false for filter with topLevelOnly', () => {
      expect(isEmptyProjectFilter({ topLevelOnly: true })).toBe(false);
    });

    // OMN-171: OR branches are a real constraint
    it('should return false for filter with orBranches', () => {
      expect(isEmptyProjectFilter({ orBranches: [{ flagged: true }] })).toBe(false);
    });
  });

  describe('describeProjectFilter', () => {
    it('should describe empty filter', () => {
      expect(describeProjectFilter({})).toBe('all projects');
    });

    it('should describe status filter', () => {
      const desc = describeProjectFilter({ status: ['active', 'onHold'] });
      expect(desc).toContain('status in [active, onHold]');
    });

    it('should describe multiple filters', () => {
      const desc = describeProjectFilter({ status: ['active'], flagged: true });
      expect(desc).toContain('status');
      expect(desc).toContain('flagged');
      expect(desc).toContain('AND');
    });

    // OMN-96
    it('should describe top-level-only filter', () => {
      const desc = describeProjectFilter({ topLevelOnly: true });
      expect(desc).toContain('top-level');
    });

    // OMN-171: OR branches are described as (...) OR (...)
    it('should describe OR branches', () => {
      const desc = describeProjectFilter({ orBranches: [{ flagged: true }, { status: ['active'] }] });
      expect(desc).toContain('OR');
      expect(desc).toContain('flagged');
      expect(desc).toContain('status');
    });
  });

  describe('buildFilteredProjectsScript', () => {
    it('should generate valid script for empty filter', () => {
      const result = buildFilteredProjectsScript({});
      expect(result.script).toContain('flattenedProjects.forEach');
      expect(result.script).toContain('matchesFilter');
      expect(result.isEmptyFilter).toBe(true);
    });

    it('should include filter code in script', () => {
      const result = buildFilteredProjectsScript({ status: ['active'] });
      expect(result.script).toContain('Project.Status.Active');
      expect(result.isEmptyFilter).toBe(false);
    });

    it('should respect limit option', () => {
      const result = buildFilteredProjectsScript({}, { limit: 25 });
      expect(result.script).toContain('limit = 25');
    });

    it('should include stats code when includeStats is true', () => {
      const result = buildFilteredProjectsScript({}, { includeStats: true });
      expect(result.script).toContain('proj.stats');
      expect(result.script).toContain('completionRate');
    });

    it('should skip task counts in lite mode', () => {
      const result = buildFilteredProjectsScript({}, { performanceMode: 'lite' });
      expect(result.script).not.toContain('proj.taskCounts');
    });

    it('should include task counts in normal mode', () => {
      const result = buildFilteredProjectsScript({}, { performanceMode: 'normal' });
      expect(result.script).toContain('proj.taskCounts');
    });
  });

  describe('buildProjectByIdScript', () => {
    it('should generate script with project ID', () => {
      const result = buildProjectByIdScript('test-project-id');
      expect(result.script).toContain('test-project-id');
      expect(result.script).toContain('Project.byIdentifier');
      expect(result.filterDescription).toBe('id = test-project-id');
    });
  });

  describe('TagQueryOptions and buildTagsScript', () => {
    it('should generate names mode script', () => {
      const options: TagQueryOptions = { mode: 'names' };
      const result = buildTagsScript(options);
      expect(result.script).toContain('tagNames.push');
      expect(result.filterDescription).toContain('names only');
    });

    it('should generate basic mode script', () => {
      const options: TagQueryOptions = { mode: 'basic' };
      const result = buildTagsScript(options);
      expect(result.script).toContain('id: tag.id.primaryKey');
      expect(result.script).toContain('name: tag.name');
      expect(result.filterDescription).toContain('basic');
    });

    it('should generate full mode script', () => {
      const options: TagQueryOptions = { mode: 'full' };
      const result = buildTagsScript(options);
      expect(result.script).toContain('tagDataMap');
      expect(result.filterDescription).toContain('full');
    });

    it('should include usage stats when requested', () => {
      const options: TagQueryOptions = { mode: 'full', includeUsageStats: true };
      const result = buildTagsScript(options);
      expect(result.script).toContain('tagUsageByName');
      expect(result.filterDescription).toContain('usage stats');
    });

    it('should respect limit option', () => {
      const options: TagQueryOptions = { mode: 'names', limit: 10 };
      const result = buildTagsScript(options);
      expect(result.script).toContain('limitCount = 10');
    });
  });

  describe('buildActiveTagsScript', () => {
    it('should generate script for active tags', () => {
      const result = buildActiveTagsScript();
      expect(result.script).toContain('!task.completed');
      expect(result.script).toContain('activeTags');
      expect(result.filterDescription).toContain('active tags');
    });
  });
});

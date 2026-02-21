import { describe, it, expect } from 'vitest';
import { buildFilteredFoldersScript } from '../../../../src/contracts/ast/script-builder.js';

describe('buildFilteredFoldersScript', () => {
  describe('basic script generation', () => {
    it('generates valid OmniJS script that lists all folders', () => {
      const result = buildFilteredFoldersScript({});

      expect(result.script).toContain('flattenedFolders');
      expect(result.script).toContain('JSON.stringify');
      expect(result.filterDescription).toBe('all folders');
    });

    it('generates script with JXA wrapper and OmniJS bridge', () => {
      const result = buildFilteredFoldersScript({});

      // Should use JXA wrapper with evaluateJavascript (same pattern as projects)
      expect(result.script).toContain("const app = Application('OmniFocus')");
      expect(result.script).toContain('app.evaluateJavascript');
    });

    it('generates valid IIFE structure', () => {
      const result = buildFilteredFoldersScript({});

      expect(result.script).toMatch(/^\(\(\) => \{/);
      expect(result.script).toMatch(/\}\)\(\)$/);
    });

    it('returns JSON with folders array and metadata', () => {
      const result = buildFilteredFoldersScript({});

      expect(result.script).toContain('folders: results');
      expect(result.script).toContain('returned_count');
      expect(result.script).toContain('total_available');
    });
  });

  describe('default fields', () => {
    it('includes id field', () => {
      const result = buildFilteredFoldersScript({});
      expect(result.script).toContain('id: folder.id.primaryKey');
    });

    it('includes name field', () => {
      const result = buildFilteredFoldersScript({});
      expect(result.script).toContain('name: folder.name');
    });

    it('includes status field', () => {
      const result = buildFilteredFoldersScript({});
      expect(result.script).toContain('getFolderStatus');
    });

    it('includes depth field', () => {
      const result = buildFilteredFoldersScript({});
      expect(result.script).toContain('getFolderDepth');
    });

    it('includes path field', () => {
      const result = buildFilteredFoldersScript({});
      expect(result.script).toContain('getFolderPath');
    });

    it('includes parent info', () => {
      const result = buildFilteredFoldersScript({});
      expect(result.script).toContain('parentId');
      expect(result.script).toContain('parentName');
    });
  });

  describe('options', () => {
    it('respects limit option', () => {
      const result = buildFilteredFoldersScript({ limit: 200 });
      expect(result.script).toContain('const limit = 200');
    });

    it('defaults limit to 100', () => {
      const result = buildFilteredFoldersScript({});
      expect(result.script).toContain('const limit = 100');
    });

    it('includes projects when includeProjects is true', () => {
      const result = buildFilteredFoldersScript({ includeProjects: true });
      expect(result.script).toContain('folder.projects');
    });

    it('does not include projects by default', () => {
      const result = buildFilteredFoldersScript({});
      // The script should have the includeProjects flag set to false
      expect(result.script).toContain('const includeProjects = false');
    });

    it('includes subfolders when includeSubfolders is true', () => {
      const result = buildFilteredFoldersScript({ includeSubfolders: true });
      expect(result.script).toContain('const includeSubfolders = true');
    });

    it('includes subfolders by default', () => {
      const result = buildFilteredFoldersScript({});
      expect(result.script).toContain('const includeSubfolders = true');
    });
  });

  describe('search filter', () => {
    it('applies search filter when provided', () => {
      const result = buildFilteredFoldersScript({ search: 'Work' });

      expect(result.script).toContain('Work');
      expect(result.script).toContain('searchFilter');
      expect(result.filterDescription).toContain('search');
    });

    it('does not include search filter when empty', () => {
      const result = buildFilteredFoldersScript({});
      // Search filter variable should be empty string
      expect(result.script).toContain('const searchFilter = ""');
    });
  });

  describe('sorting', () => {
    it('defaults to path sorting', () => {
      const result = buildFilteredFoldersScript({});
      expect(result.script).toContain("const sortBy = 'path'");
    });

    it('supports name sorting', () => {
      const result = buildFilteredFoldersScript({ sortBy: 'name' });
      expect(result.script).toContain("const sortBy = 'name'");
    });

    it('supports depth sorting', () => {
      const result = buildFilteredFoldersScript({ sortBy: 'depth' });
      expect(result.script).toContain("const sortBy = 'depth'");
    });

    it('supports ascending sort order', () => {
      const result = buildFilteredFoldersScript({ sortOrder: 'asc' });
      expect(result.script).toContain("const sortOrder = 'asc'");
    });

    it('supports descending sort order', () => {
      const result = buildFilteredFoldersScript({ sortOrder: 'desc' });
      expect(result.script).toContain("const sortOrder = 'desc'");
    });
  });

  describe('error handling', () => {
    it('generates script with try-catch error handling', () => {
      const result = buildFilteredFoldersScript({});

      expect(result.script).toContain('try {');
      expect(result.script).toContain('} catch (error)');
      expect(result.script).toContain('error: true');
    });
  });

  describe('GeneratedScript return type', () => {
    it('returns isEmptyFilter true when no search filter', () => {
      const result = buildFilteredFoldersScript({});
      expect(result.isEmptyFilter).toBe(true);
    });

    it('returns isEmptyFilter false when search filter provided', () => {
      const result = buildFilteredFoldersScript({ search: 'Work' });
      expect(result.isEmptyFilter).toBe(false);
    });
  });
});

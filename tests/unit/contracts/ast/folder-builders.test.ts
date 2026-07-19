import { describe, it, expect } from 'vitest';
import { buildFilteredFoldersScript } from '../../../../src/contracts/ast/script-builder.js';
import { recoverInnerProgram } from '../../../utils/recover-bridge-program.js';

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
      expect(result.script).toContain('folderStatusString'); // OMN-274: spliced snippet, was getFolderStatus
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

  describe('filter (OMN-170 S2)', () => {
    it('empty filter → matchesFilter returns true (match all)', () => {
      const result = buildFilteredFoldersScript({});
      expect(result.script).toContain('function matchesFilter(folder)');
      expect(result.script).toContain('return true;');
      expect(result.filterDescription).toBe('all folders');
    });

    it('name CONTAINS → case-insensitive substring predicate on folder.name', () => {
      const result = buildFilteredFoldersScript({ filter: { name: 'Work', nameOperator: 'CONTAINS' } });
      // OMN-129: assert on the recovered (decoded) program where quotes are unescaped.
      const inner = recoverInnerProgram(result.script);
      expect(inner).toContain('(folder.name || \'\').toLowerCase().includes("work")');
      expect(result.filterDescription).toContain('name contains "Work"');
    });

    it('name MATCHES → safe RegExp predicate (no raw interpolation)', () => {
      const result = buildFilteredFoldersScript({ filter: { name: 'Wo.k', nameOperator: 'MATCHES' } });
      expect(recoverInnerProgram(result.script)).toContain('new RegExp("Wo.k", \'i\').test');
    });

    it('parentName → null-guarded substring on folder.parent.name', () => {
      const result = buildFilteredFoldersScript({ filter: { parentName: 'Bills' } });
      const inner = recoverInnerProgram(result.script);
      expect(inner).toContain('folder.parent');
      expect(inner).toContain('(folder.parent.name || \'\').toLowerCase().includes("bills")');
    });

    it('topLevelOnly → !folder.parent', () => {
      const result = buildFilteredFoldersScript({ filter: { topLevelOnly: true } });
      expect(result.script).toContain('!folder.parent');
    });

    it('count honesty: filters BEFORE the limit cap, total_available from totalMatched', () => {
      const result = buildFilteredFoldersScript({ filter: { name: 'X', nameOperator: 'CONTAINS' } });
      // matchesFilter rejection precedes the limit guard
      const matchIdx = result.script.indexOf('if (!matchesFilter(folder)) return;');
      const limitIdx = result.script.indexOf('if (count >= limit) return;');
      expect(matchIdx).toBeGreaterThanOrEqual(0);
      expect(limitIdx).toBeGreaterThan(matchIdx);
      expect(result.script).toContain('totalMatched++');
      expect(result.script).toContain('total_available: totalMatched');
      expect(result.script).not.toContain('total_available: flattenedFolders.length');
    });

    it('backtick-bearing name rides safely across the JSON.stringify boundary (OMN-129)', () => {
      const result = buildFilteredFoldersScript({ filter: { name: 'a`b', nameOperator: 'CONTAINS' } });
      // OMN-129: the program crosses as a JSON string literal, so a backtick in the
      // term is inert — it lives inside an OmniJS double-quoted string and cannot
      // break structure. The whole script parses, and the recovered program both
      // parses and carries the term as a plain string value.
      expect(() => new Function(result.script)).not.toThrow();
      const inner = recoverInnerProgram(result.script);
      expect(() => new Function(inner)).not.toThrow();
      expect(inner).toContain('includes("a`b")');
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
    it('returns isEmptyFilter true when no filter', () => {
      const result = buildFilteredFoldersScript({});
      expect(result.isEmptyFilter).toBe(true);
    });

    it('returns isEmptyFilter false when a filter is provided', () => {
      const result = buildFilteredFoldersScript({ filter: { name: 'Work', nameOperator: 'CONTAINS' } });
      expect(result.isEmptyFilter).toBe(false);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { buildTagsScript } from '../../src/contracts/ast/tag-script-builder.js';
import { MANAGE_TAGS_SCRIPT } from '../../src/omnifocus/scripts/tags/manage-tags.js';

describe('Tag Type Conversion Issues', () => {
  it('should check for array/object conversion patterns in tag scripts', () => {
    // Common problematic patterns in JXA
    const problematicPatterns = [
      /\.push\([^)]+\)(?!;)/g, // push without proper handling
      /\.addTags\(\[/g, // addTags with inline array
      /\.removeTags\(\[/g, // removeTags with inline array
      /Array\.from/g, // Array.from conversions
      /\.map\(/g, // map operations that might fail
    ];

    const { script: LIST_TAGS_SCRIPT } = buildTagsScript({ mode: 'full' });

    const scripts = [
      { name: 'LIST_TAGS_SCRIPT', script: LIST_TAGS_SCRIPT },
      { name: 'MANAGE_TAGS_SCRIPT', script: MANAGE_TAGS_SCRIPT },
    ];

    scripts.forEach(({ name, script }) => {
      console.log(`\\nAnalyzing ${name} for type conversion issues:`);

      problematicPatterns.forEach((pattern, index) => {
        const matches = script.match(pattern);
        if (matches) {
          console.log(`  Found ${matches.length} instances of pattern ${index + 1}: ${pattern.source}`);
        }
      });
    });
  });

  it('should verify tag array handling patterns', () => {
    // AST builder uses OmniJS bridge - check for bridge patterns
    const { script: LIST_TAGS_SCRIPT } = buildTagsScript({ mode: 'full', includeUsageStats: true });
    expect(LIST_TAGS_SCRIPT).toContain('flattenedTags.forEach');
    expect(LIST_TAGS_SCRIPT).toContain('task.tags');

    // Merge uses OmniJS bridge with singular methods (JXA plural methods silently fail)
    expect(MANAGE_TAGS_SCRIPT).toContain('task.addTag(');
    expect(MANAGE_TAGS_SCRIPT).toContain('task.removeTag(');
  });

  it('should identify complex object serialization', () => {
    // Look for places where we might be passing complex objects
    const complexPatterns = [
      /return\s+(?!JSON\.stringify)/g, // returns without JSON.stringify
      /\{[^}]*tags:[^}]*\}/g, // object literals with tags
    ];

    const { script: LIST_TAGS_SCRIPT } = buildTagsScript({ mode: 'full' });

    complexPatterns.forEach((pattern) => {
      const listMatches = LIST_TAGS_SCRIPT.match(pattern);
      const manageMatches = MANAGE_TAGS_SCRIPT.match(pattern);

      if (listMatches || manageMatches) {
        console.log('\\nFound complex serialization patterns:');
        if (listMatches) console.log(`  LIST_TAGS: ${listMatches.length} instances`);
        if (manageMatches) console.log(`  MANAGE_TAGS: ${manageMatches.length} instances`);
      }
    });
  });
});

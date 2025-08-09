/**
 * Tag Performance Guide for LLMs using OmniFocus MCP
 *
 * This guide helps LLMs choose the optimal tag querying strategy
 */

export const TAG_PERFORMANCE_GUIDE = `
# OmniFocus Tag Query Performance Guide

When working with tags in OmniFocus, choose the right tool and options based on your needs:

## Quick Decision Tree

1. **Need only tags with active tasks?** → Use \`get_active_tags\`
   - Returns: Simple array of tag names
   - Performance: Very fast (processes only incomplete tasks)
   - Best for: GTD workflows, filtering, autocomplete

2. **Need just tag names for UI/autocomplete?** → Use \`list_tags\` with \`namesOnly: true\`
   - Returns: Array of tag names only
   - Performance: ~130ms for 100+ tags
   - Best for: Dropdowns, autocomplete, quick lists

3. **Need tag IDs but not hierarchy?** → Use \`list_tags\` with \`fastMode: true\`
   - Returns: Tags with IDs and names only
   - Performance: ~270ms for 100+ tags
   - Best for: Basic tag management, simple listings

4. **Need full tag information?** → Use \`list_tags\` (default)
   - Returns: Complete tag data with hierarchy
   - Performance: ~700ms for 100+ tags
   - Best for: Tag organization, full analysis

## Performance Comparison

| Mode | Options | Speed | Returns |
|------|---------|-------|---------|
| Active only | \`get_active_tags\` | Fastest | Tag names with tasks |
| Names only | \`namesOnly: true\` | ~130ms | Just tag names |
| Fast mode | \`fastMode: true\` | ~270ms | IDs + names |
| Full mode | (default) | ~700ms | Everything |
| With stats | \`includeUsageStats: true\` | ~3s+ | Full + task counts |

## Example Usage Patterns

### For Task Creation/Filtering
\`\`\`javascript
// Get tags to show in autocomplete
get_active_tags() // Only shows relevant tags
\`\`\`

### For Quick Tag Lists
\`\`\`javascript
// Get all tag names for a dropdown
list_tags({ namesOnly: true })
\`\`\`

### For Tag Management
\`\`\`javascript
// Get tags with IDs for renaming/deleting
list_tags({ fastMode: true })
\`\`\`

### For Tag Analysis
\`\`\`javascript
// Get full tag hierarchy and usage
list_tags({ 
  includeUsageStats: true,
  includeEmpty: false 
})
\`\`\`

## Tips for LLMs

1. **Default to performance modes** - Most operations don't need full hierarchy
2. **Use get_active_tags for GTD** - Users rarely need empty tags for task management
3. **Cache results** - Tag lists don't change frequently
4. **Avoid includeUsageStats** - Only use when specifically analyzing tag usage
5. **Consider user's tag count** - Users with 100+ tags benefit more from optimization

Remember: Users with many tags (especially empty ones) will appreciate the performance consideration!
`;

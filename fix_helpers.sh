#!/bin/bash

# Fix all remaining getAllHelpers() usage to use getMinimalHelpers()
# This addresses the critical script size issue causing "Can't convert types" errors

echo "🔧 Fixing getAllHelpers() usage in all script files..."

# Get list of files using getAllHelpers (excluding the helpers.ts definition file)
files=$(grep -l "getAllHelpers" src/**/*.ts | grep -v "/shared/helpers.ts")

echo "📊 Found $(echo "$files" | wc -l) files to fix:"
echo "$files"

echo ""
echo "🚀 Applying fixes..."

for file in $files; do
    echo "  📝 Fixing: $file"
    
    # Replace import statement
    sed -i '' 's/import { getAllHelpers }/import { getMinimalHelpers }/g' "$file"
    
    # Replace function call in template literals
    sed -i '' 's/${getAllHelpers()}/${getMinimalHelpers()}/g' "$file"
    
    echo "    ✅ Fixed getAllHelpers() usage"
done

echo ""
echo "🎯 Summary:"
echo "  - Fixed getAllHelpers() imports in $(echo "$files" | wc -l) files"
echo "  - All scripts now use minimal helpers (~15KB vs 75KB+ scripts)"
echo "  - This should resolve 'Can't convert types' errors from script size limits"
echo ""
echo "🏗️  Next steps:"
echo "  1. Run 'npm run build' to compile changes"
echo "  2. Test the focused testing prompt to verify fixes"
echo "  3. Update LESSONS_LEARNED.md with this systematic oversight"
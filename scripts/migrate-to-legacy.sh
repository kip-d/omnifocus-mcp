#!/bin/bash

# List of files that have been migrated to Zod (keep these as is)
MIGRATED_FILES=(
  "src/tools/tasks/CreateTaskTool.ts"
  "src/tools/tasks/TodaysAgendaTool.ts"
  "src/tools/tasks/GetTaskCountTool.ts"
  "src/tools/tasks/ListTasksTool.ts"
)

# Function to check if file is in migrated list
is_migrated() {
  local file=$1
  for migrated in "${MIGRATED_FILES[@]}"; do
    if [[ "$file" == "$migrated" ]]; then
      return 0
    fi
  done
  return 1
}

# Find all tool files
find src/tools -name "*.ts" -not -path "*/schemas/*" -not -name "base.ts" -not -name "legacy-base.ts" -not -name "index.ts" -not -name "types.ts" -not -name "response-types.ts" | while read -r file; do
  # Skip if already migrated to Zod
  if is_migrated "$file"; then
    echo "Skipping migrated file: $file"
    continue
  fi
  
  # Check if file imports BaseTool
  if grep -q "import.*BaseTool.*from '../base.js'" "$file"; then
    echo "Updating $file to use LegacyBaseTool"
    # Update the import
    sed -i '' "s/import { BaseTool } from '..\/base.js';/import { LegacyBaseTool } from '..\/legacy-base.js';/g" "$file"
    # Update the class declaration
    sed -i '' "s/extends BaseTool/extends LegacyBaseTool/g" "$file"
  fi
done

echo "Migration complete!"
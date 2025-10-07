# OmniFocus API TypeScript Definitions

This directory contains the official TypeScript definitions for OmniFocus automation.

## Current Version: OmniFocus.d.ts → OmniFocus-4.8.3-d.ts

- **Current**: `OmniFocus.d.ts` (symlink to latest version)
- **Latest Version**: OmniFocus 4.8.3
- **Previous Version**: OmniFocus 4.6.1 (archived as `OmniFocus-4.6.1-d.ts`)

## Version Files

- `OmniFocus.d.ts` - Symlink to the current version (always points to latest)
- `OmniFocus-4.8.3-d.ts` - TypeScript definitions for OmniFocus 4.8.3
- `OmniFocus-4.6.1-d.ts` - TypeScript definitions for OmniFocus 4.6.1 (archived)

## Usage

These definitions provide type information for all OmniFocus automation objects and methods available through JavaScript for Automation (JXA).

### Key Classes:
- `Task` - Core task management
- `Project` - Project management
- `Tag` - Tag management
- `Document` - Document-level operations
- `Database` - Database operations
- `Perspective` - Perspective management

### Important Notes:
1. These are the official API definitions from OmniGroup
2. They represent the actual automation interface available in each OmniFocus version
3. Some methods in these definitions may behave differently in JXA context
4. Always test automation scripts in OmniFocus before relying on them
5. Version-specific features (like Anchor Dates in 4.8+) are only available in corresponding versions

## How to Regenerate API Definitions

When a new version of OmniFocus is released, follow these steps to update the TypeScript definitions:

### Step 1: Export from OmniFocus

1. Open **OmniFocus**
2. Go to **Automation** → **API Reference** in the menu bar
3. A window titled **"Scripting Interface"** will open
4. Click the **export icon** (square with upward arrow) in the toolbar
5. In the save dialog, select **TypeScript** from the format dropdown
   - Available formats: HTML Text, Markdown, TypeScript
6. Save the file as `OmniFocus.ts` to your Downloads folder

### Step 2: Version and Archive

1. Note the OmniFocus version number (e.g., 4.8.3) from **OmniFocus → About OmniFocus**
2. Move the exported file to this directory:
   ```bash
   mv ~/Downloads/OmniFocus.ts src/omnifocus/api/OmniFocus-[VERSION]-d.ts
   ```
   Replace `[VERSION]` with the version number (e.g., `4.8.3`)

3. Archive the previous current version:
   ```bash
   git mv src/omnifocus/api/OmniFocus.d.ts src/omnifocus/api/OmniFocus-[OLD_VERSION]-d.ts
   ```

4. Create a symlink to the new version:
   ```bash
   cd src/omnifocus/api
   ln -s OmniFocus-[VERSION]-d.ts OmniFocus.d.ts
   ```

### Step 3: Update Documentation

1. Update the version information at the top of this README
2. Check for new API features by comparing versions:
   ```bash
   diff OmniFocus-[OLD_VERSION]-d.ts OmniFocus-[NEW_VERSION]-d.ts
   ```
3. Document any new features or breaking changes
4. Update references in code that use version-specific features

### Step 4: Test and Verify

1. Build the project: `npm run build`
2. Run tests: `npm test`
3. Check that TypeScript compilation succeeds
4. Test any scripts that use new API features

### Step 5: Commit Changes

```bash
git add src/omnifocus/api/
git commit -m "feat: update OmniFocus API definitions to version [VERSION]"
```

## Version History

- **4.8.3** - Current version (October 2025)
  - New features: Anchor Dates and other 4.8.x improvements
- **4.6.1** - Previous version (July 2025)
  - Baseline version for this MCP server

## Integration with MCP Bridge

The MCP bridge uses these definitions as a reference for:
- Correct method signatures
- Available properties and methods
- Type safety in our TypeScript code
- Understanding OmniFocus object relationships
- Version-specific feature detection
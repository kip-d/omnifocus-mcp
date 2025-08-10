#!/usr/bin/env npx tsx

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

// Write the script to a file to avoid quoting issues
const testScript = `
(() => {
  const app = Application('OmniFocus');
  app.includeStandardAdditions = true;
  
  try {
    // Try to access Perspective
    const doc = app.defaultDocument;
    
    // This might not work in JXA but let's try
    const result = {
      hasDocument: doc !== null,
      documentName: doc ? doc.name() : null
    };
    
    // Try to get window perspective (we know this property exists)
    try {
      const windows = app.windows();
      if (windows.length > 0) {
        const window = windows[0];
        const perspective = window.perspective();
        result.currentPerspective = perspective ? perspective.name() : null;
      }
    } catch (e) {
      result.perspectiveError = e.toString();
    }
    
    // Try to list all perspectives using evaluateJavascript
    try {
      const jsCode = [
        '(() => {',
        '  const result = {',
        '    builtIn: [],',
        '    custom: [],',
        '    favorites: [],',
        '    all: []',
        '  };',
        '  ',
        '  // Get built-in perspectives',
        '  if (typeof Perspective !== "undefined") {',
        '    // Built-in perspectives',
        '    if (Perspective.BuiltIn && Perspective.BuiltIn.all) {',
        '      result.builtIn = Perspective.BuiltIn.all.map(p => ({',
        '        name: p.name',
        '      }));',
        '    }',
        '    ',
        '    // Custom perspectives',
        '    if (Perspective.Custom && Perspective.Custom.all) {',
        '      result.custom = Perspective.Custom.all.map(p => ({',
        '        name: p.name,',
        '        identifier: p.identifier',
        '      }));',
        '    }',
        '    ',
        '    // All perspectives',
        '    if (Perspective.all) {',
        '      result.all = Perspective.all.map(p => ({',
        '        name: p.name',
        '      }));',
        '    }',
        '    ',
        '    // Favorite perspectives',
        '    if (Perspective.favorites) {',
        '      result.favorites = Perspective.favorites.map(p => ({',
        '        name: p.name',
        '      }));',
        '    }',
        '  }',
        '  ',
        '  return JSON.stringify(result);',
        '})()'
      ].join('\\n');
      
      const perspectivesJson = app.evaluateJavascript(jsCode);
      result.perspectives = JSON.parse(perspectivesJson);
    } catch (e) {
      result.evaluateError = e.toString();
    }
    
    return JSON.stringify(result, null, 2);
  } catch (e) {
    return JSON.stringify({ error: e.toString() });
  }
})()
`;

try {
  console.log('Testing perspective access via JXA...\n');
  
  const result = execSync(`osascript -l JavaScript -e '${testScript}'`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  
  const parsed = JSON.parse(result);
  console.log('Result:', JSON.stringify(parsed, null, 2));
  
  if (parsed.perspectives) {
    console.log('\n✅ SUCCESS! We can access perspectives via evaluateJavascript!');
    console.log(`Found ${parsed.perspectives.builtIn.length} built-in perspectives`);
    console.log(`Found ${parsed.perspectives.custom.length} custom perspectives`);
    console.log(`Found ${parsed.perspectives.favorites.length} favorite perspectives`);
  } else if (parsed.currentPerspective) {
    console.log('\n⚠️  PARTIAL: Can get current perspective but not list all');
  } else {
    console.log('\n❌ FAILED: Cannot access perspectives');
  }
} catch (error) {
  console.error('Error:', error);
}
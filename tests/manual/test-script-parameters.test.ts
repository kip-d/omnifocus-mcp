import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Script Parameter Validation', () => {
  const scriptsDir = path.join(__dirname, '../src/omnifocus/scripts');

  // Helper to extract placeholders from script content
  function extractPlaceholders(content: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const placeholders = new Set<string>();
    
    let match;
    while ((match = regex.exec(content)) !== null) {
      placeholders.add(match[1]);
    }
    
    return Array.from(placeholders);
  }

  // Helper to extract declared parameters
  function extractDeclaredParams(content: string): string[] {
    // Look for const declarations with placeholders
    const regex = /const\s+(\w+)\s*=\s*\{\{(\w+)\}\}/g;
    const declared = new Map<string, string>();
    
    let match;
    while ((match = regex.exec(content)) !== null) {
      const varName = match[1];
      const placeholder = match[2];
      
      // They should match (e.g., const projectId = {{projectId}})
      if (varName === placeholder) {
        declared.set(varName, placeholder);
      }
    }
    
    return Array.from(declared.keys());
  }

  // Find all script files recursively
  function findScriptFiles(dir: string): string[] {
    const files: string[] = [];
    
    function walk(currentDir: string) {
      const entries = fs.readdirSync(currentDir);
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
          files.push(fullPath);
        }
      }
    }
    
    walk(dir);
    return files;
  }

  // Test each script file
  const scriptFiles = findScriptFiles(scriptsDir);
  
  scriptFiles.forEach(filePath => {
    const relativePath = path.relative(scriptsDir, filePath);
    
    it(`${relativePath} should have all placeholders declared`, () => {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Skip files that don't export scripts
      if (!content.includes('export const') || !content.includes('_SCRIPT')) {
        return;
      }
      
      // Extract script name
      const scriptMatch = content.match(/export const (\w+_SCRIPT)/);
      if (!scriptMatch) return;
      
      const scriptName = scriptMatch[1];
      
      // Extract placeholders and declarations
      const placeholders = extractPlaceholders(content);
      const declared = extractDeclaredParams(content);
      
      // Find undeclared placeholders
      const undeclared = placeholders.filter(p => !declared.includes(p));
      
      // Special cases that don't need declarations (helper placeholders)
      const allowedUndeclared = ['options', 'filter', 'params', 'updates'];
      const reallyUndeclared = undeclared.filter(p => !allowedUndeclared.includes(p));
      
      expect(reallyUndeclared, 
        `Script ${scriptName} has undeclared parameters: ${reallyUndeclared.join(', ')}`
      ).toEqual([]);
    });
  });

  it('should have parameter declarations before usage', () => {
    // This test ensures parameters are declared at the beginning of scripts
    const problematicScripts: string[] = [];
    
    scriptFiles.forEach(filePath => {
      const content = fs.readFileSync(filePath, 'utf8');
      
      if (!content.includes('export const') || !content.includes('_SCRIPT')) {
        return;
      }
      
      // Check if parameters are used before declaration
      const lines = content.split('\n');
      let inScript = false;
      let declarationsSeen = new Set<string>();
      
      lines.forEach((line, index) => {
        if (line.includes('(() => {')) {
          inScript = true;
        }
        
        if (inScript) {
          // Check for parameter declarations
          const declMatch = line.match(/const\s+(\w+)\s*=\s*\{\{(\w+)\}\}/);
          if (declMatch) {
            declarationsSeen.add(declMatch[1]);
          }
          
          // Check for parameter usage (only if it's the exact parameter, not a property)
          // Look for standalone parameter usage, not property access like task.projectId
          const paramRegex = /(?<!\.)\b(projectId|taskId|tagName|completeAllTasks|deleteTasks)\b(?!\s*:)/;
          const usageMatch = line.match(paramRegex);
          if (usageMatch && !line.includes('const') && !line.includes('{{') && !declarationsSeen.has(usageMatch[1])) {
            // Additional check: make sure it's not a property access
            const beforeMatch = line.substring(0, line.indexOf(usageMatch[1]));
            if (!beforeMatch.endsWith('.') && !beforeMatch.endsWith('?.')) {
              const relativePath = path.relative(scriptsDir, filePath);
              problematicScripts.push(`${relativePath}:${index + 1} - ${usageMatch[1]} used before declaration`);
            }
          }
        }
      });
    });
    
    expect(problematicScripts, 
      `Found scripts with parameters used before declaration:\n${problematicScripts.join('\n')}`
    ).toEqual([]);
  });
});
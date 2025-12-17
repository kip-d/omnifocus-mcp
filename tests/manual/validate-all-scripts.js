#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to extract placeholders from script
function extractPlaceholders(content) {
  const regex = /\{\{(\w+)\}\}/g;
  const placeholders = new Set();

  let match;
  while ((match = regex.exec(content)) !== null) {
    placeholders.add(match[1]);
  }

  return Array.from(placeholders);
}

// Function to extract declared variables
function extractDeclaredVars(content) {
  // Look for const/let/var declarations at the beginning of the IIFE
  const regex = /const\s+(\w+)\s*=\s*\{\{/g;
  const declared = new Set();

  let match;
  while ((match = regex.exec(content)) !== null) {
    declared.add(match[1]);
  }

  return Array.from(declared);
}

// Check all script files
const scriptsDir = path.join(__dirname, '../src/omnifocus/scripts');
const issues = [];

function checkFile(filePath, relativePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Skip if not a script export
  if (!content.includes('export const') || !content.includes('_SCRIPT')) {
    return;
  }

  // Extract script name
  const scriptMatch = content.match(/export const (\w+_SCRIPT)/);
  if (!scriptMatch) return;

  const scriptName = scriptMatch[1];

  // Extract placeholders and declarations
  const placeholders = extractPlaceholders(content);
  const declared = extractDeclaredVars(content);

  // Find undeclared placeholders
  const undeclared = placeholders.filter((p) => !declared.includes(p));

  if (undeclared.length > 0) {
    issues.push({
      file: relativePath,
      script: scriptName,
      placeholders,
      declared,
      undeclared,
    });
  }
}

function walkDir(dir, baseDir = dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      walkDir(filePath, baseDir);
    } else if (file.endsWith('.ts')) {
      const relativePath = path.relative(baseDir, filePath);
      checkFile(filePath, relativePath);
    }
  }
}

console.log('Validating all OmniFocus scripts for parameter declarations...\n');

walkDir(scriptsDir);

if (issues.length === 0) {
  console.log('✅ All scripts have proper parameter declarations!');
} else {
  console.log(`❌ Found ${issues.length} scripts with missing parameter declarations:\n`);

  for (const issue of issues) {
    console.log(`File: ${issue.file}`);
    console.log(`Script: ${issue.script}`);
    console.log(`Placeholders: ${issue.placeholders.join(', ')}`);
    console.log(`Declared: ${issue.declared.join(', ') || 'none'}`);
    console.log(`Missing: ${issue.undeclared.join(', ')}`);
    console.log('---');
  }
}

#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import helper functions
const helpersPath = join(__dirname, 'src/omnifocus/scripts/shared/helpers.ts');
const helpersContent = readFileSync(helpersPath, 'utf8');

// Extract helper functions by parsing the content
function extractHelperFunction(content, functionName) {
  const start = content.indexOf(`export function ${functionName}()`);
  if (start === -1) return '';

  const returnStart = content.indexOf('return `', start);
  if (returnStart === -1) return '';

  const backtickStart = returnStart + 8; // after 'return `'
  let depth = 1;
  let pos = backtickStart;

  while (pos < content.length && depth > 0) {
    if (content[pos] === '`' && content[pos-1] !== '\\') {
      depth--;
    } else if (content[pos] === '`' && content[pos+1] === '{') {
      // Template literal interpolation - need to handle this
      depth++;
    }
    pos++;
  }

  return content.substring(backtickStart, pos - 1);
}

// Simulate what getCoreHelpers() returns
const coreHelpersPattern = /export function getCoreHelpers\(\): string \{[\s\S]*?return `([\s\S]*?)`;/;
const coreMatch = helpersContent.match(coreHelpersPattern);
const coreHelpers = coreMatch ? coreMatch[1] : '';

console.log('📏 Script Size Analysis\n');

console.log('Core helpers size:', coreHelpers.length, 'characters');

// Read current create-task script
const createTaskPath = join(__dirname, 'src/omnifocus/scripts/tasks/create-task.ts');
const createTaskContent = readFileSync(createTaskPath, 'utf8');

// Extract the template part (everything after the first backtick)
const templateStart = createTaskContent.indexOf('export const CREATE_TASK_SCRIPT = `') + 36;
const templateEnd = createTaskContent.lastIndexOf('`;');
const createTaskTemplate = createTaskContent.substring(templateStart, templateEnd);

// Replace ${getMinimalHelpers()} with actual core helpers
const expandedScript = createTaskTemplate.replace('${getMinimalHelpers()}', coreHelpers);

console.log('Create task template size:', createTaskTemplate.length, 'characters');
console.log('Expanded create task script size:', expandedScript.length, 'characters');

// Read bridge helpers
const bridgeHelpersPath = join(__dirname, 'src/omnifocus/scripts/shared/bridge-helpers.ts');
const bridgeHelpersContent = readFileSync(bridgeHelpersPath, 'utf8');

// Extract BRIDGE_HELPERS constant
const bridgePattern = /export const BRIDGE_HELPERS = `([\s\S]*?)`;/;
const bridgeMatch = bridgeHelpersContent.match(bridgePattern);
const bridgeHelpers = bridgeMatch ? bridgeMatch[1] : '';

console.log('Bridge helpers size:', bridgeHelpers.length, 'characters');

// Calculate combined size
const combinedSize = expandedScript.length + bridgeHelpers.length;
console.log('\n📊 Size Analysis:');
console.log(`Current script (with core helpers): ${expandedScript.length} chars`);
console.log(`Bridge helpers: ${bridgeHelpers.length} chars`);
console.log(`Combined size: ${combinedSize} chars`);
console.log(`JXA limit (approx): 19,000 chars`);
console.log(`Available budget: ${19000 - combinedSize} chars`);
console.log(`Fits within limit: ${combinedSize < 19000 ? '✅' : '❌'}`);

if (combinedSize >= 19000) {
  console.log('\n⚠️  Script too large! Need optimization...');

  // Calculate minimal bridge helpers needed just for tags
  const minimalTagHelpers = `
  function __formatBridgeScript(template, params) {
    let script = template;
    for (const key in params) {
      const re = new RegExp('\\\\$' + key + '\\\\$', 'g');
      const v = params[key];
      let rep;
      if (v === null || v === undefined) rep = 'null';
      else if (typeof v === 'boolean' || typeof v === 'number') rep = String(v);
      else rep = JSON.stringify(v);
      script = script.replace(re, rep);
    }
    return script;
  }

  const __TAG_TEMPLATE = '(() => { const task = Task.byIdentifier($TASK_ID$); if (!task) return "[]"; task.clearTags(); const tagNames = $TAGS$; const added = []; for (const name of tagNames) { let tag = flattenedTags.byName(name); if (!tag) tag = new Tag(name); task.addTag(tag); added.push(name); } return JSON.stringify({success: true, tags: added}); })()';

  function bridgeSetTags(app, taskId, tagNames) {
    try {
      const script = __formatBridgeScript(__TAG_TEMPLATE, {TASK_ID: taskId, TAGS: tagNames});
      const result = app.evaluateJavascript(script);
      return JSON.parse(result);
    } catch (e) {
      return {success: false, error: e.message};
    }
  }
  `;

  const minimalSize = expandedScript.length + minimalTagHelpers.length;
  console.log(`\n🎯 Minimal tag bridge size: ${minimalTagHelpers.length} chars`);
  console.log(`With minimal bridge: ${minimalSize} chars`);
  console.log(`Fits with minimal: ${minimalSize < 19000 ? '✅' : '❌'}`);
}
#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { writeFileSync } from 'fs';

const [taskId, tagName] = process.argv.slice(2);

if (!taskId || !tagName) {
  console.error('Usage: node scripts/manual/apply-tag-bridge.js <taskId> <tagName>');
  process.exit(1);
}

const addScriptLines = [
  '(function () {',
  `  var task = Task.byIdentifier(${JSON.stringify(taskId)});`,
  '  if (!task) { return JSON.stringify({ success: false, error: "task_not_found" }); }',
  `  var tagNames = ${JSON.stringify([tagName])};`,
  '  var added = [];',
  '  for (var i = 0; i < tagNames.length; i++) {',
  '    var name = tagNames[i];',
  '    var tag = null;',
  '    if (typeof Tag !== "undefined" && typeof Tag.byName === "function") {',
  '      try { tag = Tag.byName(name); } catch (lookupError) { tag = null; }',
  '    }',
  '    if (!tag) {',
  '      try { tag = new Tag(name); } catch (createError) { tag = null; }',
  '    }',
  '    if (tag) {',
  '      try { task.addTag(tag); added.push(name); } catch (addError) {}',
  '    }',
  '  }',
  '  return JSON.stringify({ success: added.length === tagNames.length, tags: added });',
  '})()'
];
const addScript = addScriptLines.join('\n');

const readScriptLines = [
  '(function () {',
  `  var task = Task.byIdentifier(${JSON.stringify(taskId)});`,
  '  if (!task) { return JSON.stringify([]); }',
  '  var tags = task.tags;',
  '  var names = [];',
  '  if (tags) {',
  '    for (var i = 0; i < tags.length; i++) {',
  '      names.push(tags[i].name);',
  '    }',
  '  }',
  '  return JSON.stringify(names);',
  '})()'
];
const readScript = readScriptLines.join('\n');

const jxaScript = `
  (function () {
    var result = {
      taskId: ${JSON.stringify(taskId)},
      tagName: ${JSON.stringify(tagName)}
    };
    try {
      var app = Application('OmniFocus');
      app.includeStandardAdditions = true;

      var addResultRaw = app.evaluateJavascript(${JSON.stringify(addScript)});
      result.bridgeAddRaw = addResultRaw;
      try { result.bridgeAdd = JSON.parse(addResultRaw); } catch (parseAdd) { result.bridgeAdd = { parseError: String(parseAdd) }; }

      var readResultRaw = app.evaluateJavascript(${JSON.stringify(readScript)});
      result.bridgeReadRaw = readResultRaw;
      try { result.bridgeRead = JSON.parse(readResultRaw); } catch (parseRead) { result.bridgeRead = { parseError: String(parseRead) }; }

      var localTags = [];
      try {
        var doc = app.defaultDocument();
        var flattened = doc ? doc.flattenedTasks() : null;
        var localTask = null;
        if (flattened) {
          for (var i = 0; i < flattened.length; i++) {
            try {
              if (flattened[i].id() === ${JSON.stringify(taskId)}) {
                localTask = flattened[i];
                break;
              }
            } catch (lookupError) {}
          }
        }
        if (localTask) {
          try {
            var directTags = localTask.tags();
            if (directTags) {
              for (var j = 0; j < directTags.length; j++) {
                try { localTags.push(directTags[j].name()); } catch (tagNameError) {}
              }
            }
          } catch (localError) {
            result.localReadError = String(localError);
          }
        } else {
          result.localReadError = 'task_not_found';
        }
      } catch (outerError) {
        result.localReadError = String(outerError);
      }
      result.localRead = localTags;
      result.success = true;
    } catch (error) {
      result.success = false;
      result.error = String(error);
    }
    return JSON.stringify(result);
  })();
`;

writeFileSync('/tmp/apply-tag-bridge.js', jxaScript);

const osascriptResult = spawnSync('osascript', ['-l', 'JavaScript', '-e', jxaScript]);

const stdout = osascriptResult.stdout.toString().trim();
const stderr = osascriptResult.stderr.toString().trim();

if (stdout) {
  console.log(stdout);
}
if (stderr) {
  console.error(stderr);
}

if (osascriptResult.status !== 0) {
  process.exit(osascriptResult.status ?? 1);
}

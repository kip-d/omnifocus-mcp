#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { writeFileSync } from 'fs';

function runProbe() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tagName = `BridgeProbeTag-${timestamp}`;
  const taskName = `BridgeProbeTask-${timestamp}`;

  const jxaScript = (() => {
    const taskIdPlaceholder = '${TASK_ID_PLACEHOLDER}';
    const addScript = [
      '(function () {',
      '  var task = Task.byIdentifier("' + taskIdPlaceholder + '");',
      '  if (!task) { return JSON.stringify({ success: false, error: "task_not_found" }); }',
      '  var tagNames = ' + JSON.stringify([tagName]) + ';',
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
      '})()',
    ].join('\n');

    const readScript = [
      '(function () {',
      '  var task = Task.byIdentifier("' + taskIdPlaceholder + '");',
      '  if (!task) { return JSON.stringify([]); }',
      '  var tags = task.tags;',
      '  var names = [];',
      '  if (tags) {',
      '    for (var i = 0; i < tags.length; i++) {',
      '      names.push(tags[i].name);',
      '    }',
      '  }',
      '  return JSON.stringify(names);',
      '})()',
    ].join('\n');

    return `
      (function () {
        var result = {
          tagName: ${JSON.stringify(tagName)},
          taskName: ${JSON.stringify(taskName)}
        };
        try {
          var app = Application('OmniFocus');
          app.includeStandardAdditions = true;
          var doc = app.defaultDocument();

          var task = app.Task({ name: ${JSON.stringify(taskName)}, note: 'Bridge probe temporary task' });
          doc.inboxTasks.push(task);
          var taskId = task.id();
          result.taskId = taskId;

          var addScript = ${JSON.stringify(addScript)}.replace(${JSON.stringify(taskIdPlaceholder)}, taskId);
          var addResultRaw = app.evaluateJavascript(addScript);
          result.bridgeAddRaw = addResultRaw;
          try { result.bridgeAdd = JSON.parse(addResultRaw); } catch (parseAdd) { result.bridgeAdd = { parseError: String(parseAdd) }; }

          var readScript = ${JSON.stringify(readScript)}.replace(${JSON.stringify(taskIdPlaceholder)}, taskId);
          var readResultRaw = app.evaluateJavascript(readScript);
          result.bridgeReadRaw = readResultRaw;
          try { result.bridgeRead = JSON.parse(readResultRaw); } catch (parseRead) { result.bridgeRead = { parseError: String(parseRead) }; }

          var localTags = [];
          try {
            var directTags = task.tags();
            if (directTags) {
              for (var i = 0; i < directTags.length; i++) {
                try { localTags.push(directTags[i].name()); } catch (tagNameError) {}
              }
            }
          } catch (localError) {
            result.localReadError = String(localError);
          }
          result.localRead = localTags;

          try { app.delete(task); } catch (deleteTaskError) { result.cleanupTaskError = String(deleteTaskError); }
          try {
            var flattened = doc.flattenedTags();
            if (flattened) {
              for (var j = 0; j < flattened.length; j++) {
                try {
                  if (flattened[j].name() === ${JSON.stringify(tagName)}) {
                    app.delete(flattened[j]);
                    break;
                  }
                } catch (tagDeleteError) {}
              }
            }
          } catch (tagCleanupError) {
            result.cleanupTagError = String(tagCleanupError);
          }

          result.success = true;
        } catch (error) {
          result.success = false;
          result.error = String(error);
        }
        return JSON.stringify(result);
      })();
    `;
  })();

  writeFileSync('/tmp/jxa-probe.js', jxaScript);

  const osascriptResult = spawnSync('osascript', ['-l', 'JavaScript', '-e', jxaScript]);

  const stdout = osascriptResult.stdout.toString().trim();
  const stderr = osascriptResult.stderr.toString().trim();

  console.log('osascript stdout:', stdout);
  if (stderr) {
    console.error('osascript stderr:', stderr);
  }

  if (osascriptResult.status !== 0) {
    throw new Error(`osascript exited with status ${osascriptResult.status}`);
  }

  const parsed = stdout ? JSON.parse(stdout) : null;
  console.log('Parsed result:', JSON.stringify(parsed, null, 2));
}

try {
  runProbe();
} catch (error) {
  console.error('Bridge probe failed:', error);
  process.exitCode = 1;
}

/**
 * AST-style builders for tag mutation scripts.
 *
 * Replaces the legacy MANAGE_TAGS_SCRIPT template with per-action builders
 * that inline parameters via JSON.stringify (no {{placeholder}} substitution).
 *
 * Each builder produces a self-contained JXA script returning a JSON envelope:
 *   { success: true, action, ... } or { error: true, message }
 */

import { getUnifiedHelpers } from '../../omnifocus/scripts/shared/helpers.js';
import type { MutationTarget } from '../mutations.js';
import type { GeneratedMutationScript } from './mutation-script-builder.js';
import { isTestMode, TEST_TAG_PREFIX } from './mutation-script-builder.js';

// ─── Sandbox guard ──────────────────────────────────────────────────

/**
 * Validate that a tag mutation targets a test-prefixed tag when running
 * in integration test mode. Prevents accidental mutation of real tags.
 */
async function validateTagMutation(tagName: string): Promise<void> {
  if (!isTestMode()) return;
  if (!tagName.startsWith(TEST_TAG_PREFIX)) {
    throw new Error(`TEST GUARD: Tag mutations must target "${TEST_TAG_PREFIX}"-prefixed tags. Got: "${tagName}"`);
  }
}

// ─── Shared script preamble ─────────────────────────────────────────

/** JXA preamble shared by all tag scripts: helpers + app + doc + allTags + parseTagPath */
function tagScriptPreamble(): string {
  return `${getUnifiedHelpers()}

  (() => {
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const allTags = doc.flattenedTags();

    if (!allTags) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tags from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedTags() returned null or undefined"
      });
    }

    function parseTagPath(input) {
      if (input.indexOf(' : ') === -1) return null;
      var segments = input.split(' : ');
      for (var i = 0; i < segments.length; i++) {
        segments[i] = segments[i].trim();
        if (segments[i].length === 0) {
          throw new Error('Invalid tag path: empty segment in "' + input + '"');
        }
      }
      return segments;
    }

`;
}

/** Close the try/catch and IIFE */
function tagScriptEpilogue(): string {
  return `
  } catch (error) {
    return formatError(error, 'manage_tags');
  }
  })();`;
}

// ─── Builders ───────────────────────────────────────────────────────

export async function buildCreateTagScript(data: {
  tagName: string;
  parentTagName?: string;
  parentTagId?: string;
}): Promise<GeneratedMutationScript> {
  validateTagMutation(data.tagName);

  const tagName = JSON.stringify(data.tagName);
  const parentTagName = JSON.stringify(data.parentTagName ?? null);
  const parentTagId = JSON.stringify(data.parentTagId ?? null);

  const script = `${tagScriptPreamble()}
    const tagName = ${tagName};
    const parentTagName = ${parentTagName};
    const parentTagId = ${parentTagId};

    // Check for path syntax
    var pathSegments = parseTagPath(tagName);

    if (pathSegments) {
      // Path syntax: "Work : Projects : Active"
      if (parentTagName || parentTagId) {
        return JSON.stringify({
          error: true,
          message: "Cannot use path syntax (' : ' separator) with parentTag parameter. Use either path syntax OR parentTag, not both."
        });
      }

      const pathCreateScript = \`
        (() => {
          var segments = \${JSON.stringify(pathSegments)};
          var pathStr = \${JSON.stringify(tagName)};
          var parent = null;
          var current = null;
          var created = [];
          for (var i = 0; i < segments.length; i++) {
            current = null;
            var children = parent ? parent.children : tags;
            for (var j = 0; j < children.length; j++) {
              if (children[j].name === segments[i]) { current = children[j]; break; }
            }
            if (!current) {
              current = parent ? new Tag(segments[i], parent) : new Tag(segments[i], null);
              created.push(segments[i]);
            }
            parent = current;
          }
          return JSON.stringify({
            success: true,
            action: 'created',
            tagName: current.name,
            tagId: current.id.primaryKey,
            path: pathStr,
            createdSegments: created,
            message: created.length === 0
              ? "Tag path '" + pathStr + "' already exists"
              : "Created " + created.length + " tag(s) in path '" + pathStr + "'"
          });
        })()
      \`;

      try {
        var pathResult = app.evaluateJavascript(pathCreateScript);
        return pathResult;
      } catch (pathError) {
        return JSON.stringify({
          error: true,
          message: pathError.message || String(pathError)
        });
      }
    }

    // Non-path syntax: original create logic
    for (let i = 0; i < allTags.length; i++) {
      if (safeGet(() => allTags[i].name()) === tagName) {
        return JSON.stringify({
          error: true,
          message: "Tag '" + tagName + "' already exists"
        });
      }
    }

    let parentTag = null;
    if (parentTagName || parentTagId) {
      for (let i = 0; i < allTags.length; i++) {
        const tag = allTags[i];
        if (parentTagId && safeGet(() => tag.id()) === parentTagId) {
          parentTag = tag;
          break;
        } else if (parentTagName && safeGet(() => tag.name()) === parentTagName) {
          parentTag = tag;
          break;
        }
      }

      if (!parentTag) {
        return JSON.stringify({
          error: true,
          message: "Parent tag not found: " + (parentTagName || parentTagId)
        });
      }
    }

    try {
      let newTag;
      if (parentTag) {
        const parentTagsCollection = safeGet(() => parentTag.tags);
        if (!parentTagsCollection) {
          return JSON.stringify({
            error: true,
            message: "Failed to access parent tag's tags collection"
          });
        }

        newTag = app.make({
          new: 'tag',
          withProperties: { name: tagName },
          at: parentTagsCollection
        });
      } else {
        const tagCollection = safeGet(() => doc.tags);
        if (!tagCollection) {
          return JSON.stringify({
            error: true,
            message: "Failed to access document tags collection"
          });
        }

        newTag = app.make({
          new: 'tag',
          withProperties: { name: tagName },
          at: tagCollection
        });
      }

      // Bridge: JXA .id() loop -> index -> OmniJS primaryKey (OMN-27)
      const refreshedTags = doc.flattenedTags();
      let newTagIdx = -1;
      let parentTagIdx = -1;
      for (let bi = refreshedTags.length - 1; bi >= 0; bi--) {
        try {
          const tid = refreshedTags[bi].id();
          if (tid === newTag.id()) newTagIdx = bi;
          if (parentTag && tid === parentTag.id()) parentTagIdx = bi;
        } catch(e) {}
      }

      let realTagId = 'unknown';
      let realParentId = null;

      if (newTagIdx >= 0) {
        try {
          const idScript = '(' +
            '() => {' +
              'var r = { tagId: flattenedTags[' + newTagIdx + '].id.primaryKey };' +
              (parentTagIdx >= 0 ? 'r.parentId = flattenedTags[' + parentTagIdx + '].id.primaryKey;' : '') +
              'return JSON.stringify(r);' +
            '}' +
          ')()';
          const idResult = JSON.parse(app.evaluateJavascript(idScript));
          realTagId = idResult.tagId || 'unknown';
          if (idResult.parentId) realParentId = idResult.parentId;
        } catch(e) {}
      }

      return JSON.stringify({
        success: true,
        action: 'created',
        tagName: tagName,
        tagId: realTagId,
        parentTagName: parentTag ? safeGet(() => parentTag.name()) : null,
        parentTagId: realParentId,
        message: parentTag ?
          "Tag '" + tagName + "' created under '" + safeGet(() => parentTag.name()) + "'" :
          "Tag '" + tagName + "' created successfully"
      });
    } catch (createError) {
      try {
        let newTag;
        if (parentTag) {
          const parentTagsCollection = safeGet(() => parentTag.tags);
          if (!parentTagsCollection) {
            return JSON.stringify({
              error: true,
              message: "Failed to access parent tag's tags collection"
            });
          }
          newTag = safeGet(() => parentTagsCollection.push(app.Tag({ name: tagName })));
        } else {
          const tagCollection = safeGet(() => doc.tags);
          if (!tagCollection) {
            return JSON.stringify({
              error: true,
              message: "Failed to access document tags collection"
            });
          }
          newTag = safeGet(() => tagCollection.push(app.Tag({ name: tagName })));
        }

        return JSON.stringify({
          success: true,
          action: 'created',
          tagName: tagName,
          parentTagName: parentTag ? safeGet(() => parentTag.name()) : null,
          message: parentTag ?
            "Tag '" + tagName + "' created under '" + safeGet(() => parentTag.name()) + "'" :
            "Tag '" + tagName + "' created successfully"
        });
      } catch (altError) {
        return JSON.stringify({
          error: true,
          message: "Failed to create tag: " + createError.toString() + " / " + altError.toString()
        });
      }
    }
${tagScriptEpilogue()}`;

  return { script, operation: 'create', target: 'tag' as MutationTarget };
}

export async function buildRenameTagScript(data: {
  tagName: string;
  newName: string;
}): Promise<GeneratedMutationScript> {
  validateTagMutation(data.tagName);
  validateTagMutation(data.newName);

  const tagName = JSON.stringify(data.tagName);
  const newName = JSON.stringify(data.newName);

  const script = `${tagScriptPreamble()}
    const tagName = ${tagName};
    const newName = ${newName};

    let tagToRename = null;
    for (let i = 0; i < allTags.length; i++) {
      if (safeGet(() => allTags[i].name()) === tagName) {
        tagToRename = allTags[i];
        break;
      }
    }

    if (!tagToRename) {
      return JSON.stringify({
        error: true,
        message: "Tag '" + tagName + "' not found"
      });
    }

    for (let i = 0; i < allTags.length; i++) {
      if (safeGet(() => allTags[i].name()) === newName) {
        return JSON.stringify({
          error: true,
          message: "Tag '" + newName + "' already exists"
        });
      }
    }

    tagToRename.name = newName;

    return JSON.stringify({
      success: true,
      action: 'renamed',
      oldName: tagName,
      newName: newName,
      message: "Tag renamed from '" + tagName + "' to '" + newName + "'"
    });
${tagScriptEpilogue()}`;

  return { script, operation: 'rename', target: 'tag' as MutationTarget };
}

export async function buildDeleteTagScript(data: { tagName: string }): Promise<GeneratedMutationScript> {
  validateTagMutation(data.tagName);

  const tagName = JSON.stringify(data.tagName);

  const script = `${tagScriptPreamble()}
    const tagName = ${tagName};

    let tagToDelete = null;
    let tagIndex = -1;
    for (let i = 0; i < allTags.length; i++) {
      if (safeGet(() => allTags[i].name()) === tagName) {
        tagToDelete = allTags[i];
        tagIndex = i;
        break;
      }
    }

    if (!tagToDelete) {
      return JSON.stringify({
        error: true,
        message: "Tag '" + tagName + "' not found"
      });
    }

    try {
      app.delete(tagToDelete);

      return JSON.stringify({
        success: true,
        action: 'deleted',
        tagName: tagName,
        message: "Tag '" + tagName + "' deleted successfully."
      });
    } catch (deleteError) {
      return JSON.stringify({
        error: true,
        message: "Failed to delete tag: " + deleteError.toString(),
        details: "Tag '" + tagName + "' exists but could not be deleted"
      });
    }
${tagScriptEpilogue()}`;

  return { script, operation: 'delete', target: 'tag' as MutationTarget };
}

export async function buildMergeTagsScript(data: {
  tagName: string;
  targetTag: string;
}): Promise<GeneratedMutationScript> {
  validateTagMutation(data.tagName);
  validateTagMutation(data.targetTag);

  const tagName = JSON.stringify(data.tagName);
  const targetTag = JSON.stringify(data.targetTag);

  const script = `${tagScriptPreamble()}
    const tagName = ${tagName};
    const targetTag = ${targetTag};

    let sourceTag = null;
    let targetTagObj = null;

    for (let i = 0; i < allTags.length; i++) {
      if (safeGet(() => allTags[i].name()) === tagName) {
        sourceTag = allTags[i];
      }
      if (safeGet(() => allTags[i].name()) === targetTag) {
        targetTagObj = allTags[i];
      }
    }

    if (!sourceTag) {
      return JSON.stringify({
        error: true,
        message: "Source tag '" + tagName + "' not found"
      });
    }

    if (!targetTagObj) {
      return JSON.stringify({
        error: true,
        message: "Target tag '" + targetTag + "' not found"
      });
    }

    // Move all tasks from source to target using OmniJS bridge
    const mergeScript = \`
      (() => {
        const srcName = \${JSON.stringify(tagName)};
        const tgtName = \${JSON.stringify(targetTag)};

        var srcTag = null;
        var tgtTag = null;
        flattenedTags.forEach(t => {
          if (t.name === srcName) srcTag = t;
          if (t.name === tgtName) tgtTag = t;
        });

        if (!srcTag || !tgtTag) {
          return JSON.stringify({ error: true, message: "Tag not found in OmniJS context" });
        }

        var count = 0;
        flattenedTasks.forEach(task => {
          var hasSrc = false;
          var hasTgt = false;
          task.tags.forEach(t => {
            if (t === srcTag) hasSrc = true;
            if (t === tgtTag) hasTgt = true;
          });
          if (hasSrc) {
            task.removeTag(srcTag);
            if (!hasTgt) task.addTag(tgtTag);
            count++;
          }
        });

        return JSON.stringify({ success: true, count: count });
      })()
    \`;

    let mergedCount = 0;
    try {
      const mergeResult = JSON.parse(app.evaluateJavascript(mergeScript));
      if (mergeResult.error) {
        return JSON.stringify({
          error: true,
          message: "Merge retagging failed: " + mergeResult.message
        });
      }
      mergedCount = mergeResult.count;
    } catch (bridgeError) {
      return JSON.stringify({
        error: true,
        message: "Failed to execute merge retagging: " + bridgeError.toString()
      });
    }

    try {
      app.delete(sourceTag);

      return JSON.stringify({
        success: true,
        action: 'merged',
        sourceTag: tagName,
        targetTag: targetTag,
        tasksMerged: mergedCount,
        message: "Merged '" + tagName + "' into '" + targetTag + "'. " + mergedCount + " tasks updated."
      });
    } catch (deleteError) {
      return JSON.stringify({
        success: true,
        action: 'merged_with_warning',
        sourceTag: tagName,
        targetTag: targetTag,
        tasksMerged: mergedCount,
        warning: "Tags were merged but source tag could not be deleted: " + deleteError.toString(),
        message: "Merged " + mergedCount + " tasks but could not delete source tag"
      });
    }
${tagScriptEpilogue()}`;

  return { script, operation: 'merge', target: 'tag' as MutationTarget };
}

export async function buildNestTagScript(data: {
  tagName: string;
  parentTagName?: string;
  parentTagId?: string;
}): Promise<GeneratedMutationScript> {
  validateTagMutation(data.tagName);
  if (data.parentTagName) validateTagMutation(data.parentTagName);

  const tagName = JSON.stringify(data.tagName);
  const parentTagName = JSON.stringify(data.parentTagName ?? '');
  const parentTagId = JSON.stringify(data.parentTagId ?? '');

  const script = `${tagScriptPreamble()}
    const tagName = ${tagName};

    if (!${JSON.stringify(data.parentTagName || '')} && !${JSON.stringify(data.parentTagId || '')}) {
      return JSON.stringify({
        error: true,
        message: "Parent tag name or ID is required for nest action"
      });
    }

    const nestScript = \`
      (() => {
        const tagToNestName = \${JSON.stringify(tagName)};
        const parentName = ${parentTagName};
        const parentId = ${parentTagId};

        let tagToNest = null;
        flattenedTags.forEach(t => {
          if (t.name === tagToNestName) tagToNest = t;
        });

        if (!tagToNest) {
          return JSON.stringify({
            error: true,
            message: "Tag '" + tagToNestName + "' not found"
          });
        }

        let parentTag = null;
        flattenedTags.forEach(t => {
          if (parentId && t.id.primaryKey === parentId) parentTag = t;
          else if (parentName && t.name === parentName) parentTag = t;
        });

        if (!parentTag) {
          return JSON.stringify({
            error: true,
            message: "Parent tag not found: " + (parentName || parentId)
          });
        }

        if (tagToNest.id.primaryKey === parentTag.id.primaryKey) {
          return JSON.stringify({
            error: true,
            message: "Cannot nest tag under itself"
          });
        }

        try {
          moveTags([tagToNest], parentTag);
          return JSON.stringify({
            success: true,
            action: 'nested',
            tagName: tagToNestName,
            parentTagName: parentTag.name,
            parentTagId: parentTag.id.primaryKey,
            message: "Tag '" + tagToNestName + "' nested under '" + parentTag.name + "'"
          });
        } catch (e) {
          return JSON.stringify({
            error: true,
            message: "Failed to nest tag: " + e.toString()
          });
        }
      })()
    \`;

    try {
      const nestResult = app.evaluateJavascript(nestScript);
      return nestResult;
    } catch (bridgeError) {
      return JSON.stringify({
        error: true,
        message: "Failed to execute nest operation: " + bridgeError.toString()
      });
    }
${tagScriptEpilogue()}`;

  return { script, operation: 'nest', target: 'tag' as MutationTarget };
}

export async function buildUnparentTagScript(data: { tagName: string }): Promise<GeneratedMutationScript> {
  validateTagMutation(data.tagName);

  const tagName = JSON.stringify(data.tagName);

  const script = `${tagScriptPreamble()}
    const tagName = ${tagName};

    const unparentScript = \`
      (() => {
        const tagToUnparentName = \${JSON.stringify(tagName)};

        let tagToUnparent = null;
        flattenedTags.forEach(t => {
          if (t.name === tagToUnparentName) tagToUnparent = t;
        });

        if (!tagToUnparent) {
          return JSON.stringify({
            error: true,
            message: "Tag '" + tagToUnparentName + "' not found"
          });
        }

        try {
          moveTags([tagToUnparent], null);
          return JSON.stringify({
            success: true,
            action: 'unparented',
            tagName: tagToUnparentName,
            message: "Tag '" + tagToUnparentName + "' moved to root level"
          });
        } catch (e) {
          return JSON.stringify({
            error: true,
            message: "Failed to unparent tag: " + e.toString()
          });
        }
      })()
    \`;

    try {
      const unparentResult = app.evaluateJavascript(unparentScript);
      return unparentResult;
    } catch (bridgeError) {
      return JSON.stringify({
        error: true,
        message: "Failed to execute unparent operation: " + bridgeError.toString()
      });
    }
${tagScriptEpilogue()}`;

  return { script, operation: 'unparent', target: 'tag' as MutationTarget };
}

export async function buildReparentTagScript(data: {
  tagName: string;
  parentTagName?: string;
  parentTagId?: string;
}): Promise<GeneratedMutationScript> {
  validateTagMutation(data.tagName);
  if (data.parentTagName) validateTagMutation(data.parentTagName);

  const tagName = JSON.stringify(data.tagName);
  const parentTagName = JSON.stringify(data.parentTagName ?? '');
  const parentTagId = JSON.stringify(data.parentTagId ?? '');

  const script = `${tagScriptPreamble()}
    const tagName = ${tagName};

    const reparentScript = \`
      (() => {
        const tagToReparentName = \${JSON.stringify(tagName)};
        const parentName = ${parentTagName};
        const parentId = ${parentTagId};

        let tagToReparent = null;
        flattenedTags.forEach(t => {
          if (t.name === tagToReparentName) tagToReparent = t;
        });

        if (!tagToReparent) {
          return JSON.stringify({
            error: true,
            message: "Tag '" + tagToReparentName + "' not found"
          });
        }

        let newParent = null;
        if (parentName || parentId) {
          flattenedTags.forEach(t => {
            if (parentId && t.id.primaryKey === parentId) newParent = t;
            else if (parentName && t.name === parentName) newParent = t;
          });

          if (!newParent) {
            return JSON.stringify({
              error: true,
              message: "New parent tag not found: " + (parentName || parentId)
            });
          }

          if (tagToReparent.id.primaryKey === newParent.id.primaryKey) {
            return JSON.stringify({
              error: true,
              message: "Cannot reparent tag under itself"
            });
          }
        }

        try {
          moveTags([tagToReparent], newParent);
          if (newParent) {
            return JSON.stringify({
              success: true,
              action: 'reparented',
              tagName: tagToReparentName,
              newParentTagName: newParent.name,
              newParentTagId: newParent.id.primaryKey,
              message: "Tag '" + tagToReparentName + "' moved under '" + newParent.name + "'"
            });
          } else {
            return JSON.stringify({
              success: true,
              action: 'reparented',
              tagName: tagToReparentName,
              message: "Tag '" + tagToReparentName + "' moved to root level"
            });
          }
        } catch (e) {
          return JSON.stringify({
            error: true,
            message: "Failed to reparent tag: " + e.toString()
          });
        }
      })()
    \`;

    try {
      const reparentResult = app.evaluateJavascript(reparentScript);
      return reparentResult;
    } catch (bridgeError) {
      return JSON.stringify({
        error: true,
        message: "Failed to execute reparent operation: " + bridgeError.toString()
      });
    }
${tagScriptEpilogue()}`;

  return { script, operation: 'reparent', target: 'tag' as MutationTarget };
}

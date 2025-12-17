/**
 * Secure template system for evaluateJavascript() bridge operations
 * Prevents injection attacks by properly escaping all dynamic values
 */

export interface BridgeTemplateParams {
  [key: string]: unknown;
}

/**
 * Formats a bridge script template with secure parameter substitution
 * All parameters are JSON.stringify'd to prevent injection attacks
 *
 * @param template Script template with $PARAM_NAME$ placeholders
 * @param params Object containing parameter values
 * @returns Formatted script safe for evaluateJavascript()
 *
 * @example
 * const template = `
 *   const task = Task.byIdentifier($TASK_ID$);
 *   task.name = $TASK_NAME$;
 * `;
 * const script = formatBridgeScript(template, {
 *   TASK_ID: "abc123",
 *   TASK_NAME: "Task with \"quotes\""
 * });
 * // Result: const task = Task.byIdentifier("abc123");
 * //         task.name = "Task with \"quotes\"";
 */
export function formatBridgeScript(template: string, params: BridgeTemplateParams): string {
  let script = template;

  for (const [key, value] of Object.entries(params)) {
    const placeholder = new RegExp(`\\$${key}\\$`, 'g');

    // Special handling for different value types
    let replacement: string;

    if (value === null || value === undefined) {
      replacement = 'null';
    } else if (typeof value === 'boolean') {
      replacement = value.toString();
    } else if (typeof value === 'number') {
      replacement = value.toString();
    } else if (typeof value === 'string') {
      // JSON.stringify properly escapes quotes, newlines, etc.
      replacement = JSON.stringify(value);
    } else if (Array.isArray(value)) {
      // Arrays need special handling for things like tag arrays
      replacement = JSON.stringify(value);
    } else if (typeof value === 'object') {
      // Objects are JSON stringified
      replacement = JSON.stringify(value);
    } else {
      // Fallback for any other type
      replacement = JSON.stringify(value);
    }

    script = script.replace(placeholder, replacement);
  }

  // Check for any remaining placeholders (indicates missing parameters)
  const remainingPlaceholders = script.match(/\$[A-Z_]+\$/g);
  if (remainingPlaceholders) {
    throw new Error(`Missing template parameters: ${remainingPlaceholders.join(', ')}`);
  }

  return script;
}

/**
 * Common bridge script templates
 */
export const BridgeTemplates = {
  /**
   * Get a task by ID
   */
  GET_TASK: `
    const task = Task.byIdentifier($TASK_ID$);
    if (task) {
      JSON.stringify({ success: true, id: task.id.primaryKey });
    } else {
      JSON.stringify({ success: false, error: "task_not_found" });
    }
  `,

  /**
   * Assign tags to a task
   */
  ASSIGN_TAGS: `
    const task = Task.byIdentifier($TASK_ID$);
    if (task) {
      const tagNames = $TAGS$;
      const tags = tagNames.map(name => 
        flattenedTags.byName(name) || new Tag(name)
      );
      task.clearTags();
      tags.forEach(tag => task.addTag(tag));
      JSON.stringify({ success: true, tags: tagNames });
    } else {
      JSON.stringify({ success: false, error: "task_not_found" });
    }
  `,

  /**
   * Set repeat rule on a task
   */
  SET_REPEAT_RULE: `
    const task = Task.byIdentifier($TASK_ID$);
    if (task) {
      const rule = new Task.RepetitionRule($RULE_STRING$, $METHOD$);
      task.repetitionRule = rule;
      JSON.stringify({ success: true });
    } else {
      JSON.stringify({ success: false, error: "task_not_found" });
    }
  `,

  /**
   * Move task to a new parent or project
   */
  MOVE_TASK: `
    const task = Task.byIdentifier($TASK_ID$);
    if (!task) {
      JSON.stringify({ success: false, error: "task_not_found" });
    } else {
      const targetType = $TARGET_TYPE$;
      const targetId = $TARGET_ID$;
      
      if (targetType === "inbox") {
        moveTasks([task], inbox.beginning);
        JSON.stringify({ success: true, moved: "inbox" });
      } else if (targetType === "project") {
        const project = Project.byIdentifier(targetId);
        if (project) {
          moveTasks([task], project.beginning);
          JSON.stringify({ success: true, moved: "project", projectId: targetId });
        } else {
          JSON.stringify({ success: false, error: "project_not_found" });
        }
      } else if (targetType === "parent") {
        const parent = Task.byIdentifier(targetId);
        if (parent) {
          moveTasks([task], parent.ending);
          JSON.stringify({ success: true, moved: "parent", parentId: targetId });
        } else {
          JSON.stringify({ success: false, error: "parent_not_found" });
        }
      } else {
        JSON.stringify({ success: false, error: "invalid_target_type" });
      }
    }
  `,
};

/**
 * Execute a bridge script template with parameters
 * This is a helper that combines template formatting with common error handling
 */
export function executeBridgeTemplate(app: any, template: string, params: BridgeTemplateParams): any {
  try {
    const script = formatBridgeScript(template, params);
    // JXA Application objects are inherently untyped
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const resultStr = app.evaluateJavascript(script);

    // Try to parse as JSON if it looks like JSON
    if (resultStr && typeof resultStr === 'string' && (resultStr.startsWith('{') || resultStr.startsWith('['))) {
      try {
        return JSON.parse(resultStr);
      } catch {
        // Not JSON, return as-is
        return resultStr;
      }
    }

    return resultStr;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Bridge script execution failed: ${message}`);
  }
}

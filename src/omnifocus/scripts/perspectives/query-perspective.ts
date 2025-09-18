import { getMinimalHelpers, getSerializationHelpers } from '../shared/helpers.js';

/**
 * Script to query tasks from a specific perspective without switching windows
 */
export const QUERY_PERSPECTIVE_SCRIPT = `
  ${getMinimalHelpers()}
  ${getSerializationHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const perspectiveName = {{perspectiveName}};
    const limit = {{limit}} || 50;
    const includeDetails = {{includeDetails}} || false;
    
    try {
      const metadataScript = \`
        (() => {
          const name = \${JSON.stringify(perspectiveName)};
          const builtInNames = ["Inbox", "Projects", "Tags", "Forecast", "Flagged", "Nearby", "Review"];
          const response = {
            success: true,
            perspectiveName: name,
            perspectiveType: null,
            aggregation: "all",
            filterRules: []
          };
          
          function safeGetValue(getter, defaultValue = null) {
            try {
              const result = getter();
              return result !== undefined && result !== null ? result : defaultValue;
            } catch (error) {
              return defaultValue;
            }
          }

          const seenRules = [];
          function serializeRule(rule, depth = 0) {
            if (rule === null || rule === undefined) {
              return null;
            }
            if (rule instanceof Date) {
              return safeGetValue(() => rule.toISOString(), null);
            }
            const ruleType = typeof rule;
            if (ruleType !== 'object') {
              return rule;
            }
            if (depth > 10) {
              return null;
            }
            if (seenRules.indexOf(rule) !== -1) {
              return null;
            }

            seenRules.push(rule);

            const result = {};
            try {
              const keys = collectSerializableKeys(rule);
              for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                if (!key || key === 'Application' || key === 'application') {
                  continue;
                }

                let value;
                try {
                  value = rule[key];
                } catch (readError) {
                  continue;
                }

                if (value === undefined || value === null) {
                  continue;
                }

                const valueType = typeof value;
                if (valueType === 'function') {
                  continue;
                }

                if (value instanceof Date) {
                  const isoValue = safeGetValue(() => value.toISOString(), null);
                  if (isoValue) {
                    result[key] = isoValue;
                  }
                  continue;
                }

                if (Array.isArray(value)) {
                  const items = [];
                  for (let j = 0; j < value.length; j++) {
                    const serialized = serializeRule(value[j], depth + 1);
                    if (serialized !== undefined && serialized !== null) {
                      items.push(serialized);
                    }
                  }
                  result[key] = items;
                  continue;
                }

                if (valueType === 'object') {
                  const constructorName = safeGetValue(() => value.constructor && value.constructor.name, '');
                  if (constructorName === 'Application') {
                    continue;
                  }
                  const identifier = extractIdentifier(value);
                  if (identifier !== null && identifier !== undefined) {
                    result[key] = identifier;
                    continue;
                  }
                  const nested = serializeRule(value, depth + 1);
                  if (nested !== undefined && nested !== null) {
                    result[key] = nested;
                  }
                  continue;
                }

                if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
                  result[key] = value;
                }
              }
            } finally {
              seenRules.pop();
            }

            return result;
          }

          function collectSerializableKeys(obj) {
            const keys = [];

            try {
              const ownKeys = Object.keys(obj);
              for (let i = 0; i < ownKeys.length; i++) {
                if (keys.indexOf(ownKeys[i]) === -1) {
                  keys.push(ownKeys[i]);
                }
              }
            } catch (e) {}

            try {
              const propertyNames = Object.getOwnPropertyNames(obj);
              for (let i = 0; i < propertyNames.length; i++) {
                if (keys.indexOf(propertyNames[i]) === -1) {
                  keys.push(propertyNames[i]);
                }
              }
            } catch (e) {}

            return keys;
          }

          function extractIdentifier(obj) {
            if (!obj || typeof obj !== 'object') {
              return null;
            }

            const primaryKey = safeGetValue(() => {
              if (typeof obj.primaryKey === 'function') {
                return obj.primaryKey();
              }
              return obj.primaryKey;
            }, null);
            if (primaryKey) {
              return primaryKey;
            }

            const identifier = safeGetValue(() => {
              if (typeof obj.identifier === 'function') {
                return obj.identifier();
              }
              return obj.identifier;
            }, null);
            if (identifier) {
              return identifier;
            }

            const idValue = safeGetValue(() => {
              if (typeof obj.id === 'function') {
                return obj.id();
              }
              return obj.id;
            }, null);
            if (idValue) {
              const idPrimaryKey = safeGetValue(() => {
                if (idValue && typeof idValue.primaryKey !== 'function') {
                  return idValue.primaryKey;
                }
                if (idValue && typeof idValue.primaryKey === 'function') {
                  return idValue.primaryKey();
                }
                return null;
              }, null);
              if (idPrimaryKey) {
                return idPrimaryKey;
              }
              return idValue;
            }

            const nameValue = safeGetValue(() => {
              if (typeof obj.name === 'function') {
                return obj.name();
              }
              return obj.name;
            }, null);
            if (nameValue) {
              return nameValue;
            }

            return null;
          }
          
          try {
            if (typeof Perspective === "undefined") {
              response.success = false;
              response.error = "Perspective API not available";
              return JSON.stringify(response);
            }
            
            if (builtInNames.includes(name)) {
              response.perspectiveType = "builtin";
              switch (name) {
                case "Flagged":
                  response.filterRules = [
                    { actionStatus: "flagged" },
                    { actionAvailability: "remaining" }
                  ];
                  break;
                case "Inbox":
                  response.filterRules = [
                    { actionHasNoProject: true },
                    { actionAvailability: "remaining" }
                  ];
                  break;
                case "Forecast":
                  response.filterRules = [
                    { actionHasDueDate: true },
                    { actionAvailability: "remaining" }
                  ];
                  break;
                case "Projects":
                  response.filterRules = [
                    { actionIsProjectOrGroup: true }
                  ];
                  break;
                case "Tags":
                  response.filterRules = [
                    { actionAvailability: "remaining" }
                  ];
                  break;
                default:
                  response.filterRules = [];
                  break;
              }
            } else if (Perspective.Custom && Perspective.Custom.byName) {
              const custom = Perspective.Custom.byName(name);
              if (custom) {
                response.perspectiveType = "custom";
                response.identifier = custom.identifier;
                response.aggregation = custom.archivedTopLevelFilterAggregation || "all";
                const rules = custom.archivedFilterRules || [];
                response.filterRules = rules.map(rule => serializeRule(rule));
              }
            }
            
            if (!response.perspectiveType) {
              response.success = false;
              response.error = "Perspective not found: " + name;
            }
          } catch (err) {
            response.success = false;
            response.error = err && err.message ? err.message : String(err);
          }
          
          return JSON.stringify(response);
        })()
      \`;
      
      const metadataRaw = app.evaluateJavascript(metadataScript);
      const metadata = JSON.parse(metadataRaw);
      
      if (!metadata.success) {
        return JSON.stringify({ error: true, message: metadata.error || 'Failed to resolve perspective metadata' });
      }
      
      const allTasks = doc.flattenedTasks();
      if (!allTasks) {
        return JSON.stringify({
          error: true,
          message: 'Unable to access OmniFocus tasks. Ensure OmniFocus is running.'
        });
      }
      
      const filterRules = metadata.filterRules || [];
      const aggregation = metadata.aggregation || 'all';
      const tasks = [];
      
      for (let i = 0; i < allTasks.length && tasks.length < limit; i++) {
        const task = allTasks[i];
        const snapshot = buildTaskSnapshot(task);
        if (matchesAllRules(snapshot, filterRules, aggregation)) {
          tasks.push(serializeTask(task, includeDetails));
        }
      }
      
      return JSON.stringify({
        perspectiveName: metadata.perspectiveName,
        perspectiveType: metadata.perspectiveType,
        tasks: tasks,
        metadata: {
          total_count: tasks.length,
          limit_applied: limit,
          aggregation
        }
      });
      
    } catch (error) {
      return formatError(error, 'query_perspective');
    }
    
    function buildTaskSnapshot(task) {
      const project = safeGetProject(task);
      const tagIds = [];
      const tagNames = [];
      try {
        const rawTags = task.tags();
        if (rawTags) {
          for (let i = 0; i < rawTags.length; i++) {
            try {
              const tag = rawTags[i];
              const tagId = safeGet(() => tag.id());
              const name = safeGet(() => tag.name());
              if (tagId && tagId.primaryKey) {
                tagIds.push(tagId.primaryKey);
              } else if (tagId) {
                tagIds.push(tagId);
              }
              if (name) {
                tagNames.push(name);
              }
            } catch (tagError) {}
          }
        }
      } catch (tagOuterError) {}
      
      const taskStatus = safeGet(() => task.taskStatus && task.taskStatus().toString(), '');
      const available = taskStatus.toLowerCase().includes('available') || safeGet(() => task.available(), false);
      const dropped = safeGet(() => task.dropped && task.dropped(), false);
      const completed = isTaskEffectivelyCompleted(task);
      const hasChildren = safeGet(() => task.numberOfTasks && task.numberOfTasks(), 0) > 0;
      
      let isProject = false;
      try {
        const container = task.containingProject();
        if (container) {
          const root = safeGet(() => container.rootTask && container.rootTask());
          if (root && safeGet(() => root.id()) === safeGet(() => task.id())) {
            isProject = true;
          }
        }
      } catch (projectCheckError) {}
      
      return {
        completed,
        dropped,
        flagged: isFlagged(task),
        dueDate: safeGetDate(() => task.dueDate()),
        deferDate: safeGetDate(() => task.deferDate()),
        available,
        project,
        hasChildren,
        isProject,
        tags: tagNames,
        tagIds,
      };
    }
    
    function matchesRule(snapshot, rule) {
      if (!rule) return true;
      
      const availability = rule.actionAvailability;
      if (availability === 'available' && !snapshot.available) return false;
      if (availability === 'remaining' && (snapshot.completed || snapshot.dropped)) return false;
      if (availability === 'completed' && !snapshot.completed) return false;
      if (availability === 'dropped' && !snapshot.dropped) return false;
      
      if (rule.actionStatus === 'flagged' && !snapshot.flagged) return false;
      if (rule.actionStatus === 'due' && !snapshot.dueDate) return false;
      
      if (rule.actionHasDueDate === true && !snapshot.dueDate) return false;
      if (rule.actionHasDueDate === false && snapshot.dueDate) return false;
      if (rule.actionHasDeferDate === true && !snapshot.deferDate) return false;
      if (rule.actionHasDeferDate === false && snapshot.deferDate) return false;
      
      if (rule.actionHasNoProject === true && snapshot.project) return false;
      if (rule.actionHasNoProject === false && !snapshot.project) return false;
      if (rule.actionIsProject === true && !snapshot.isProject) return false;
      if (rule.actionIsProjectOrGroup === true && !(snapshot.isProject || snapshot.hasChildren)) return false;
      if (rule.actionIsLeaf === true && snapshot.hasChildren) return false;
      if (rule.actionIsLeaf === false && !snapshot.hasChildren) return false;
      
      if (rule.actionIsUntagged === true && snapshot.tags.length > 0) return false;
      if (rule.actionIsUntagged === false && snapshot.tags.length === 0) return false;
      
      if (rule.actionHasAnyOfTags && rule.actionHasAnyOfTags.length > 0) {
        if (!snapshot.tagIds || snapshot.tagIds.length === 0) return false;
        const hasAny = rule.actionHasAnyOfTags.some(tagId => snapshot.tagIds.includes(tagId));
        if (!hasAny) return false;
      }
      
      if (rule.aggregateRules && rule.aggregateRules.length > 0) {
        const aggregateType = rule.aggregateType || 'all';
        if (!matchesAllRules(snapshot, rule.aggregateRules, aggregateType)) return false;
      }
      
      return true;
    }
    
    function matchesAllRules(snapshot, rules, aggregationType) {
      if (!rules || rules.length === 0) return true;
      if (aggregationType === 'any') {
        return rules.some(rule => matchesRule(snapshot, rule));
      }
      if (aggregationType === 'none') {
        return !rules.some(rule => matchesRule(snapshot, rule));
      }
      return rules.every(rule => matchesRule(snapshot, rule));
    }
  })();
`;

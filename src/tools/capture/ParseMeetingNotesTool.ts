import { z } from 'zod';
import { BaseTool } from '../base.js';
import { createSuccessResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { coerceBoolean } from '../schemas/coercion-helpers.js';
import { detectContextTags } from './context-detection.js';
import { extractDates } from './date-extraction.js';

/**
 * Schema for parse_meeting_notes tool
 */
const ParseMeetingNotesSchema = z.object({
  input: z.string()
    .min(10)
    .describe('Meeting notes, transcript, or other text to parse for action items'),

  extractMode: z.enum(['action_items', 'projects', 'both'])
    .default('both')
    .describe('What to extract: action_items (tasks only), projects (projects with tasks), or both'),

  suggestProjects: coerceBoolean()
    .default(true)
    .describe('Auto-detect matches to existing projects'),

  suggestTags: coerceBoolean()
    .default(true)
    .describe('Suggest context tags based on content (@computer, @phone, etc.)'),

  suggestDueDates: coerceBoolean()
    .default(true)
    .describe('Extract due dates from text (e.g., "by Friday", "next Tuesday")'),

  suggestEstimates: coerceBoolean()
    .default(true)
    .describe('Estimate task duration based on keywords'),

  returnFormat: z.enum(['preview', 'batch_ready'])
    .default('preview')
    .describe('Output format: preview (for user review) or batch_ready (for direct batch_create)'),

  groupByProject: coerceBoolean()
    .default(true)
    .describe('Group tasks by detected project'),

  existingProjects: z.array(z.string())
    .optional()
    .describe('Known project names for better matching'),

  defaultProject: z.string()
    .optional()
    .describe('Fallback project for unmatched items'),
});

type ParseMeetingNotesArgs = z.infer<typeof ParseMeetingNotesSchema>;

interface ExtractedTask {
  tempId: string;
  name: string;
  suggestedProject: string | null;
  projectMatch: 'exact' | 'partial' | 'none';
  suggestedTags: string[];
  suggestedDueDate?: string;
  suggestedDeferDate?: string;
  estimatedMinutes?: number;
  confidence: 'high' | 'medium' | 'low';
  sourceText: string;
  note?: string;
}

interface ExtractedProject {
  tempId: string;
  name: string;
  tasks: Array<{
    tempId: string;
    name: string;
    estimatedMinutes?: number;
    suggestedTags?: string[];
  }>;
  confidence: 'high' | 'medium' | 'low';
  sourceText: string;
}

interface ExtractionResult {
  tasks: ExtractedTask[];
  projects: ExtractedProject[];
}

interface BatchItem {
  tempId: string;
  type: 'project' | 'task';
  name: string;
  parentTempId?: string;
  note?: string;
  tags?: string[];
  dueDate?: string;
  deferDate?: string;
  estimatedMinutes?: number;
}

/**
 * Tool for parsing meeting notes and extracting action items
 *
 * Converts unstructured text (meeting notes, transcripts, emails) into
 * structured OmniFocus tasks and projects.
 */
export class ParseMeetingNotesTool extends BaseTool<typeof ParseMeetingNotesSchema> {
  name = 'parse_meeting_notes';
  description =
    'Extract action items from meeting notes, transcripts, or other unstructured text. ' +
    'Automatically detects tasks, projects, assignees, due dates, and context tags. ' +
    'Returns structured preview for user review or batch-ready format for direct creation. ' +
    'Perfect for capturing meeting outcomes, email action items, or voice notes.';

  schema = ParseMeetingNotesSchema;

  async executeValidated(args: ParseMeetingNotesArgs): Promise<unknown> {
    const timer = new OperationTimerV2();

    try {
      this.logger.info('Parsing meeting notes', {
        inputLength: args.input.length,
        extractMode: args.extractMode,
        returnFormat: args.returnFormat,
      });

      // Extract action items from text
      const extracted = this.extractActionItems(args.input, args);

      // Format output based on returnFormat
      const result = args.returnFormat === 'preview'
        ? this.formatPreview(extracted, args)
        : this.formatBatchReady(extracted, args);

      return createSuccessResponseV2(
        'parse_meeting_notes',
        result,
        undefined,
        timer.toMetadata(),
      ) as unknown;
    } catch (error) {
      this.logger.error('Parse meeting notes failed', { error });
      return createErrorResponseV2(
        'parse_meeting_notes',
        'PARSE_ERROR',
        error instanceof Error ? error.message : 'Failed to parse meeting notes',
        'Check that the input text contains actionable items',
        undefined,
        timer.toMetadata(),
      ) as unknown;
    }
  }

  /**
   * Extract action items from text
   */
  private extractActionItems(input: string, args: ParseMeetingNotesArgs): ExtractionResult {
    const lines = input.split('\n').filter(line => line.trim());
    const tasks: ExtractedTask[] = [];
    const projects: ExtractedProject[] = [];

    let taskCounter = 1;
    let projectCounter = 1;
    let currentProject: ExtractedProject | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and common non-actionable headers
      if (!trimmed || this.isNonActionable(trimmed)) {
        continue;
      }

      // Check if this line describes a project (multi-step item)
      if (args.extractMode !== 'action_items') {
        const projectMatch = this.detectProject(trimmed);
        if (projectMatch) {
          if (currentProject) {
            projects.push(currentProject);
          }
          currentProject = {
            tempId: `proj_${projectCounter++}`,
            name: projectMatch.name,
            tasks: [],
            confidence: projectMatch.confidence,
            sourceText: trimmed,
          };
          continue;
        }
      }

      // Extract task from line
      if (args.extractMode !== 'projects') {
        const task = this.extractTask(trimmed, args, taskCounter, currentProject !== null);
        if (task) {
          if (currentProject) {
            // Add as subtask to current project
            currentProject.tasks.push({
              tempId: task.tempId,
              name: task.name,
              estimatedMinutes: task.estimatedMinutes,
              suggestedTags: task.suggestedTags,
            });
          } else {
            tasks.push(task);
          }
          taskCounter++;
        }
      }
    }

    // Add final project if exists
    if (currentProject) {
      projects.push(currentProject);
    }

    return { tasks, projects };
  }

  /**
   * Detect if line is a non-actionable header/label
   */
  private isNonActionable(line: string): boolean {
    const nonActionablePatterns = [
      /^(meeting|agenda|action items?|discussion|attendees?|standalone task):/i,
      /^(date|time|location):/i,
      /^meeting\s+notes:/i,  // "Meeting Notes:"
      /^#+\s/,  // Markdown headers
      /^\*+\s/, // Bullet points without content
      /^-+\s*$/, // Dividers
    ];

    return nonActionablePatterns.some(pattern => pattern.test(line));
  }

  /**
   * Detect if line describes a project (multi-step item)
   */
  private detectProject(line: string): { name: string; confidence: 'high' | 'medium' | 'low' } | null {
    // Look for project indicators: colons, "project:", multi-step phrases
    const projectPatterns = [
      /^(.+?)\s+project:/i,
      /^project:\s*(.+)/i,
      /^(.+?):\s*(create|build|design|plan|implement)/i,
      /(.+?)\s+(includes?|involves?|requires?):/i,
    ];

    for (const pattern of projectPatterns) {
      const match = line.match(pattern);
      if (match) {
        return {
          name: match[1].trim(),
          confidence: 'high',
        };
      }
    }

    // Check for simple header with colon (e.g., "Project Alpha:")
    if (/^[A-Z]/.test(line) && /^(.+?):\s*$/.test(line)) {
      const match = line.match(/^(.+?):\s*$/);
      if (match) {
        return {
          name: match[1].trim(),
          confidence: 'medium',
        };
      }
    }

    // Check for phrases that indicate multi-step work
    if (/(then|after that|followed by|next step)/i.test(line)) {
      // Extract project name from beginning of line
      const match = line.match(/^(.+?)(?:\s*[:|-]|\s+(then|after|followed))/i);
      if (match) {
        return {
          name: match[1].trim(),
          confidence: 'medium',
        };
      }
    }

    return null;
  }

  /**
   * Extract task from a line of text
   */
  private extractTask(
    line: string,
    args: ParseMeetingNotesArgs,
    taskId: number,
    isUnderProject = false,
  ): ExtractedTask | null {
    // Remove common bullet points and numbering
    let cleaned = line.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '').trim();

    // Skip if too short to be a task
    if (cleaned.length < 5) {
      return null;
    }

    // Look for action verbs (be more lenient for tasks under a project)
    const actionVerbs = [
      'send', 'call', 'email', 'review', 'update', 'create', 'write', 'schedule',
      'discuss', 'follow up', 'check', 'prepare', 'organize', 'plan', 'research',
      'contact', 'complete', 'finish', 'implement', 'test', 'deploy', 'ask',
      'buy', 'purchase', 'get', 'pick up', 'drop off', 'waiting', 'task',
    ];

    const hasActionVerb = actionVerbs.some(verb =>
      new RegExp(`\\b${verb}\\b`, 'i').test(cleaned),
    );

    // If no action verb and not under a project, skip
    if (!hasActionVerb && !isUnderProject) {
      return null;
    }

    // If under a project but still seems like a header, skip
    if (isUnderProject && !hasActionVerb && cleaned.length < 3) {
      return null;
    }

    // Extract task name (everything before time/date references)
    const taskName = this.extractTaskName(cleaned);

    // Detect assignee and convert to tags
    const assigneeTags = this.detectAssignee(cleaned);

    // Suggest context tags
    const contextTags = args.suggestTags
      ? detectContextTags(cleaned)
      : [];

    // Combine all tags
    const allTags = [...new Set([...assigneeTags, ...contextTags])];

    // Extract dates
    const dates = args.suggestDueDates
      ? extractDates(cleaned)
      : {};

    // Estimate duration
    const estimate = args.suggestEstimates
      ? this.estimateDuration(cleaned)
      : undefined;

    // Match to existing project if provided
    let projectMatch: { project: string | null; match: 'exact' | 'partial' | 'none' };
    if (args.existingProjects) {
      projectMatch = this.matchToProject(cleaned, args.existingProjects);
      // Use default project if no match found
      if (projectMatch.match === 'none' && args.defaultProject) {
        projectMatch = { project: args.defaultProject, match: 'none' };
      }
    } else {
      projectMatch = { project: args.defaultProject || null, match: 'none' };
    }

    return {
      tempId: `task_${taskId}`,
      name: taskName,
      suggestedProject: projectMatch.project,
      projectMatch: projectMatch.match,
      suggestedTags: allTags,
      suggestedDueDate: dates.dueDate,
      suggestedDeferDate: dates.deferDate,
      estimatedMinutes: estimate,
      confidence: this.calculateConfidence(taskName, allTags, dates),
      sourceText: line,
      note: this.extractNote(cleaned, taskName),
    };
  }

  /**
   * Extract clean task name
   */
  private extractTaskName(text: string): string {
    // Remove assignee mentions
    let name = text.replace(/\b(by|for|with|from)\s+\w+\b/gi, '');

    // Remove date/time references at end
    name = name.replace(/\s+(by|on|before|after|until)\s+[\w\s,]+$/i, '');
    name = name.replace(/\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week)$/i, '');

    return name.trim();
  }

  /**
   * Detect assignee from text and convert to tags
   */
  private detectAssignee(text: string): string[] {
    const tags: string[] = [];

    // Pattern: "John to..." or "John needs to..."
    const assigneeMatch = text.match(/^(\w+)\s+(to|needs to|will|should)\b/i);
    if (assigneeMatch) {
      tags.push(`@${assigneeMatch[1].toLowerCase()}`);
    }

    // Pattern: "Waiting for/on Sarah" - handle possessive forms
    const waitingMatch = text.match(/waiting\s+(?:for|on)\s+(\w+)(?:'s)?/i);
    if (waitingMatch) {
      tags.push(`@waiting-for-${waitingMatch[1].toLowerCase()}`);
    }

    // Pattern: "Ask/Check with/Discuss with Bob"
    const agendaMatch = text.match(/(ask|check with|discuss with|talk to)\s+(\w+)/i);
    if (agendaMatch) {
      tags.push(`@agenda-${agendaMatch[2].toLowerCase()}`);
    }

    return tags;
  }

  /**
   * Estimate task duration based on keywords
   */
  private estimateDuration(text: string): number | undefined {
    const durationHints = [
      { pattern: /\bdeep work\b|\bfocus\b/i, minutes: 180 },
      { pattern: /\bplan\b|\banalyze\b|\bresearch\b/i, minutes: 120 },
      { pattern: /\bwrite\b|\bcreate\b|\bdesign\b/i, minutes: 90 },
      { pattern: /\bmeeting\b|\bdiscuss\b/i, minutes: 60 },
      { pattern: /\bcall\b|\bphone\b/i, minutes: 30 },
      { pattern: /\breview\b|\bcheck\b/i, minutes: 30 },
      { pattern: /\bquick\b|\bbrief\b|\bshort\b/i, minutes: 15 },
    ];

    for (const hint of durationHints) {
      if (hint.pattern.test(text)) {
        return hint.minutes;
      }
    }

    return undefined;
  }

  /**
   * Match task to existing project
   */
  private matchToProject(text: string, existingProjects: string[]): {
    project: string | null;
    match: 'exact' | 'partial' | 'none';
  } {
    const textLower = text.toLowerCase();

    // Check for exact match
    for (const project of existingProjects) {
      if (textLower.includes(project.toLowerCase())) {
        return { project, match: 'exact' };
      }
    }

    // Check for partial match (keywords, excluding common words)
    const commonWords = ['project', 'task', 'the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in'];
    for (const project of existingProjects) {
      const keywords = project.toLowerCase().split(/\s+/).filter(k => !commonWords.includes(k) && k.length > 2);
      if (keywords.length > 0 && keywords.some(keyword => textLower.includes(keyword))) {
        return { project, match: 'partial' };
      }
    }

    return { project: null, match: 'none' };
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    name: string,
    tags: string[],
    dates: { dueDate?: string; deferDate?: string },
  ): 'high' | 'medium' | 'low' {
    let score = 0;

    if (name.length > 10) score++;
    if (tags.length > 0) score++;
    if (dates.dueDate || dates.deferDate) score++;

    return score >= 2 ? 'high' : score === 1 ? 'medium' : 'low';
  }

  /**
   * Extract additional note from text
   */
  private extractNote(fullText: string, taskName: string): string | undefined {
    const remainder = fullText.replace(taskName, '').trim();
    return remainder.length > 10 ? remainder : undefined;
  }

  /**
   * Format output as preview
   */
  private formatPreview(extracted: ExtractionResult, args: ParseMeetingNotesArgs): unknown {
    const totalTasks = extracted.tasks.length +
      extracted.projects.reduce((sum, p) => sum + p.tasks.length, 0);

    const highConfidence = [
      ...extracted.tasks.filter(t => t.confidence === 'high'),
      ...extracted.projects.filter(p => p.confidence === 'high'),
    ].length;

    const mediumConfidence = [
      ...extracted.tasks.filter(t => t.confidence === 'medium'),
      ...extracted.projects.filter(p => p.confidence === 'medium'),
    ].length;

    const needsReview = extracted.tasks
      .filter(t => t.confidence === 'low' || t.projectMatch === 'none')
      .map(t => t.tempId);

    return {
      extracted: {
        tasks: extracted.tasks,
        projects: extracted.projects,
      },
      summary: {
        totalTasks,
        totalProjects: extracted.projects.length,
        highConfidence,
        mediumConfidence,
        needsReview,
      },
      nextSteps: args.returnFormat === 'preview'
        ? 'Review extracted items and use batch_create to add to OmniFocus'
        : 'Ready for batch_create tool',
    };
  }

  /**
   * Format output as batch-ready
   */
  private formatBatchReady(extracted: ExtractionResult, _args: ParseMeetingNotesArgs): unknown {
    const batchItems: BatchItem[] = [];

    // Add projects and their tasks
    for (const project of extracted.projects) {
      batchItems.push({
        tempId: project.tempId,
        type: 'project',
        name: project.name,
      });

      for (const task of project.tasks) {
        batchItems.push({
          tempId: task.tempId,
          type: 'task',
          parentTempId: project.tempId,
          name: task.name,
          estimatedMinutes: task.estimatedMinutes,
          tags: task.suggestedTags,
        });
      }
    }

    // Add standalone tasks
    for (const task of extracted.tasks) {
      batchItems.push({
        tempId: task.tempId,
        type: 'task',
        name: task.name,
        note: task.note,
        tags: task.suggestedTags,
        dueDate: task.suggestedDueDate,
        deferDate: task.suggestedDeferDate,
        estimatedMinutes: task.estimatedMinutes,
      });
    }

    return {
      batchItems,
      summary: {
        totalItems: batchItems.length,
        totalProjects: extracted.projects.length,
        totalTasks: extracted.tasks.length,
      },
      readyForBatchCreate: true,
      usage: 'Pass batchItems to batch_create tool: batch_create({ items: result.batchItems })',
    };
  }
}

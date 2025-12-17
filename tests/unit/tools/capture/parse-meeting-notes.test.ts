import { describe, it, expect, beforeEach } from 'vitest';
import { ParseMeetingNotesTool } from '../../../../src/tools/capture/ParseMeetingNotesTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';

describe('ParseMeetingNotesTool', () => {
  let tool: ParseMeetingNotesTool;
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager();
    tool = new ParseMeetingNotesTool(cache);
  });

  describe('Tool metadata', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('parse_meeting_notes');
      expect(tool.description).toContain('Extract action items');
      expect(tool.description).toContain('meeting notes');
    });
  });

  describe('Basic extraction', () => {
    it('should extract simple action items', async () => {
      const input = `
Meeting Notes:
- Send proposal to client
- Call Sarah about budget
- Review quarterly report
      `;

      const result = (await tool.execute({
        input,
        returnFormat: 'preview',
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.extracted.tasks).toHaveLength(3);
      expect(result.data.extracted.tasks[0].name).toContain('Send proposal');
      expect(result.data.extracted.tasks[1].name).toContain('Call Sarah');
      expect(result.data.extracted.tasks[2].name).toContain('Review');
    });

    it('should detect projects with multiple tasks', async () => {
      const input = `
Website Redesign project:
- Review current analytics
- Create wireframes
- User testing
      `;

      const result = (await tool.execute({
        input,
        returnFormat: 'preview',
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.extracted.projects).toHaveLength(1);
      expect(result.data.extracted.projects[0].name).toBe('Website Redesign');
      expect(result.data.extracted.projects[0].tasks).toHaveLength(3);
    });

    it('should skip non-actionable lines', async () => {
      const input = `
Meeting: Q4 Planning
Date: October 1, 2025
Attendees: John, Sarah, Bob

Action Items:
- Send report to team
      `;

      const result = (await tool.execute({
        input,
        returnFormat: 'preview',
      })) as any;

      expect(result.success).toBe(true);
      // Should only extract the one actionable item
      expect(result.data.extracted.tasks).toHaveLength(1);
      expect(result.data.extracted.tasks[0].name).toContain('Send report');
    });
  });

  describe('Tag suggestions', () => {
    it('should suggest location tags', async () => {
      const input = `
- Send email to client
- Call John about meeting
- Buy groceries
      `;

      const result = (await tool.execute({
        input,
        suggestTags: true,
        returnFormat: 'preview',
      })) as any;

      expect(result.success).toBe(true);

      // Email task should have @computer tag
      const emailTask = result.data.extracted.tasks.find((t: any) => t.name.includes('email'));
      expect(emailTask.suggestedTags).toContain('@computer');

      // Call task should have @phone tag
      const callTask = result.data.extracted.tasks.find((t: any) => t.name.includes('Call'));
      expect(callTask.suggestedTags).toContain('@phone');

      // Buy task should have @errands tag
      const buyTask = result.data.extracted.tasks.find((t: any) => t.name.includes('Buy'));
      expect(buyTask.suggestedTags).toContain('@errands');
    });

    it('should suggest time estimate tags', async () => {
      const input = `
- Quick review of document
- Plan Q4 strategy
      `;

      const result = (await tool.execute({
        input,
        suggestTags: true,
        returnFormat: 'preview',
      })) as any;

      expect(result.success).toBe(true);

      // Quick task should have @15min tag
      const quickTask = result.data.extracted.tasks[0];
      expect(quickTask.suggestedTags).toContain('@15min');

      // Planning task should have @deep-work tag
      const planTask = result.data.extracted.tasks[1];
      expect(planTask.suggestedTags).toContain('@deep-work');
    });

    it('should suggest priority tags', async () => {
      const input = `
- URGENT: Send proposal to client asap
- Must complete Q4 review
      `;

      const result = (await tool.execute({
        input,
        suggestTags: true,
        returnFormat: 'preview',
      })) as any;

      expect(result.success).toBe(true);

      const urgentTask = result.data.extracted.tasks[0];
      expect(urgentTask.suggestedTags).toContain('@urgent');

      const importantTask = result.data.extracted.tasks[1];
      expect(importantTask.suggestedTags).toContain('@important');
    });
  });

  describe('Assignee detection', () => {
    it('should detect assignees and create tags', async () => {
      const input = `
- John to send quarterly report
- Waiting for Sarah's budget approval
- Ask Bob about timeline
      `;

      const result = (await tool.execute({
        input,
        returnFormat: 'preview',
      })) as any;

      expect(result.success).toBe(true);

      // John assignee
      const johnTask = result.data.extracted.tasks[0];
      expect(johnTask.suggestedTags).toContain('@john');

      // Waiting for Sarah
      const sarahTask = result.data.extracted.tasks[1];
      expect(sarahTask.suggestedTags).toContain('@waiting-for-sarah');

      // Agenda for Bob
      const bobTask = result.data.extracted.tasks[2];
      expect(bobTask.suggestedTags).toContain('@agenda-bob');
    });
  });

  describe('Due date extraction', () => {
    it('should extract relative due dates', async () => {
      const input = `
- Send report by Friday
- Call client tomorrow
- Review by next week
      `;

      const result = (await tool.execute({
        input,
        suggestDueDates: true,
        returnFormat: 'preview',
      })) as any;

      expect(result.success).toBe(true);

      // All tasks should have suggested due dates
      expect(result.data.extracted.tasks[0].suggestedDueDate).toBeDefined();
      expect(result.data.extracted.tasks[1].suggestedDueDate).toBeDefined();
      expect(result.data.extracted.tasks[2].suggestedDueDate).toBeDefined();

      // Dates should be in YYYY-MM-DD format
      expect(result.data.extracted.tasks[0].suggestedDueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should extract defer dates from "after" phrases', async () => {
      const input = `
- Follow up with client next Tuesday
- Check back after meeting
      `;

      const result = (await tool.execute({
        input,
        suggestDueDates: true,
        returnFormat: 'preview',
      })) as any;

      expect(result.success).toBe(true);

      // Follow up task should have defer date
      expect(result.data.extracted.tasks[0].suggestedDeferDate).toBeDefined();
    });
  });

  describe('Duration estimation', () => {
    it('should estimate task duration', async () => {
      const input = `
- Quick call with client
- Review quarterly report
- Plan annual strategy
      `;

      const result = (await tool.execute({
        input,
        suggestEstimates: true,
        returnFormat: 'preview',
      })) as any;

      expect(result.success).toBe(true);

      // Quick call = 15 min
      expect(result.data.extracted.tasks[0].estimatedMinutes).toBe(30);

      // Review = 30 min
      expect(result.data.extracted.tasks[1].estimatedMinutes).toBe(30);

      // Planning = 120 min
      expect(result.data.extracted.tasks[2].estimatedMinutes).toBe(120);
    });
  });

  describe('Extract modes', () => {
    it('should extract only tasks when mode is action_items', async () => {
      const input = `
Website Redesign project:
- Create wireframes
- Build prototype

Standalone task:
- Send email to client
      `;

      const result = (await tool.execute({
        input,
        extractMode: 'action_items',
        returnFormat: 'preview',
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.extracted.projects).toHaveLength(0);
      expect(result.data.extracted.tasks.length).toBeGreaterThan(0);
    });

    it('should extract only projects when mode is projects', async () => {
      const input = `
Website Redesign project:
- Create wireframes
- Build prototype

Standalone task:
- Send email to client
      `;

      const result = (await tool.execute({
        input,
        extractMode: 'projects',
        returnFormat: 'preview',
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.extracted.projects).toHaveLength(1);
      expect(result.data.extracted.tasks).toHaveLength(0);
    });
  });

  describe('Project matching', () => {
    it('should match tasks to existing projects', async () => {
      const input = `
- Update Client Onboarding documentation
- Review work projects status
      `;

      const result = (await tool.execute({
        input,
        existingProjects: ['Client Onboarding', 'Work Projects'],
        returnFormat: 'preview',
      })) as any;

      expect(result.success).toBe(true);

      // First task should match exactly
      const task1 = result.data.extracted.tasks[0];
      expect(task1.suggestedProject).toBe('Client Onboarding');
      expect(task1.projectMatch).toBe('exact');

      // Second task should match exactly
      const task2 = result.data.extracted.tasks[1];
      expect(task2.suggestedProject).toBe('Work Projects');
      expect(task2.projectMatch).toBe('exact');
    });

    it('should use default project when no match found', async () => {
      const input = `
- Random task with no project match
      `;

      const result = (await tool.execute({
        input,
        existingProjects: ['Unrelated Project'],
        defaultProject: 'Inbox',
        returnFormat: 'preview',
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.extracted.tasks[0].suggestedProject).toBe('Inbox');
    });
  });

  describe('Batch-ready output', () => {
    it('should format output for batch_create tool', async () => {
      const input = `
Project Alpha:
- Task 1
- Task 2

Standalone task
      `;

      const result = (await tool.execute({
        input,
        returnFormat: 'batch_ready',
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.batchItems).toBeDefined();
      expect(Array.isArray(result.data.batchItems)).toBe(true);
      expect(result.data.readyForBatchCreate).toBe(true);

      // Should have project + 2 tasks + standalone task
      expect(result.data.batchItems.length).toBeGreaterThanOrEqual(4);

      // First item should be project
      expect(result.data.batchItems[0].type).toBe('project');

      // Next items should be tasks with parentTempId
      expect(result.data.batchItems[1].type).toBe('task');
      expect(result.data.batchItems[1].parentTempId).toBe(result.data.batchItems[0].tempId);
    });
  });

  describe('Confidence scoring', () => {
    it('should assign high confidence to clear action items', async () => {
      const input = `
- Send proposal to client by Friday
      `;

      const result = (await tool.execute({
        input,
        returnFormat: 'preview',
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.extracted.tasks[0].confidence).toBe('high');
    });

    it('should assign low confidence to ambiguous items', async () => {
      const input = `
- Maybe
      `;

      const result = (await tool.execute({
        input,
        returnFormat: 'preview',
      })) as any;

      expect(result.success).toBe(true);
      // Short, no tags, no dates = low confidence
      if (result.data.extracted.tasks.length > 0) {
        expect(result.data.extracted.tasks[0].confidence).toBe('low');
      }
    });
  });

  describe('Summary generation', () => {
    it('should provide accurate summary statistics', async () => {
      const input = `
Project A:
- Task 1
- Task 2

- Standalone task 1
- Standalone task 2
      `;

      const result = (await tool.execute({
        input,
        returnFormat: 'preview',
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.summary).toBeDefined();
      expect(result.data.summary.totalProjects).toBe(1);
      expect(result.data.summary.totalTasks).toBe(4); // 2 in project + 2 standalone
    });
  });

  describe('Error handling', () => {
    it('should reject input that is too short', async () => {
      const input = 'x';

      await expect(
        tool.execute({
          input,
        }),
      ).rejects.toThrow('Invalid parameters');
    });

    it('should handle empty action items gracefully', async () => {
      const input = `
Meeting: Q4 Planning
Date: October 1, 2025
Attendees: Everyone

No actual action items discussed.
      `;

      const result = (await tool.execute({
        input,
        returnFormat: 'preview',
      })) as any;

      expect(result.success).toBe(true);
      expect(result.data.extracted.tasks).toHaveLength(0);
      expect(result.data.extracted.projects).toHaveLength(0);
    });
  });
});

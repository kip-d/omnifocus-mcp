import { describe, it, expect } from 'vitest';
import {
  isOFTask,
  isOFProject,
  isOFTag,
  adaptTask,
  adaptProject,
  adaptTag,
  adaptTasks,
  adaptProjects,
  adaptTags,
} from '../../src/omnifocus/api/type-adapters.js';

describe('Type Adapters', () => {
  describe('Type Guards', () => {
    it('should identify valid OmniFocus task objects', () => {
      const validTask = {
        id: () => 'task-1',
        name: () => 'Test Task',
        completed: () => false,
        flagged: () => true,
        note: () => 'Test note',
      };
      
      expect(isOFTask(validTask)).toBe(true);
      expect(isOFTask({})).toBe(false);
      expect(isOFTask(null)).toBe(false);
      expect(isOFTask({ id: 'not-a-function' })).toBe(false);
    });

    it('should identify valid OmniFocus project objects', () => {
      const validProject = {
        id: () => 'proj-1',
        name: () => 'Test Project',
        status: () => 'active',
        flagged: () => false,
      };
      
      expect(isOFProject(validProject)).toBe(true);
      expect(isOFProject({})).toBe(false);
      expect(isOFProject(null)).toBe(false);
    });

    it('should identify valid OmniFocus tag objects', () => {
      const validTag = {
        id: () => 'tag-1',
        name: () => 'Test Tag',
        allowsNextAction: () => true,
      };
      
      expect(isOFTag(validTag)).toBe(true);
      expect(isOFTag({})).toBe(false);
      expect(isOFTag(null)).toBe(false);
    });
  });

  describe('Task Adaptation', () => {
    it('should adapt a basic task', () => {
      const ofTask = {
        id: () => 'task-1',
        name: () => 'Test Task',
        completed: () => false,
        flagged: () => true,
        inInbox: () => false,
        note: () => null,
        dueDate: () => null,
        deferDate: () => null,
        completionDate: () => null,
        estimatedMinutes: () => null,
        tags: () => [],
        containingProject: () => null,
        repetitionRule: () => null,
        added: () => null,
        effectivelyCompleted: () => false,
        blocked: () => false,
        sequential: () => false,
      };

      const adapted = adaptTask(ofTask);
      
      expect(adapted).toEqual({
        id: 'task-1',
        name: 'Test Task',
        completed: false,
        flagged: true,
        inInbox: false,
        tags: [],
        effectivelyCompleted: false,
        blocked: false,
        sequential: false,
        recurringStatus: {
          isRecurring: false,
          type: 'non-recurring',
        },
      });
    });

    it('should adapt a task with all properties', () => {
      const dueDate = new Date('2025-07-30');
      const deferDate = new Date('2025-07-25');
      const completionDate = new Date('2025-07-29');
      const addedDate = new Date('2025-07-20');
      
      const project = {
        id: () => 'proj-1',
        name: () => 'Test Project',
      };
      
      const tag1 = { name: () => 'work' };
      const tag2 = { name: () => 'urgent' };
      
      const ofTask = {
        id: () => 'task-1',
        name: () => 'Complex Task',
        completed: () => true,
        flagged: () => true,
        inInbox: () => false,
        note: () => 'Task notes',
        dueDate: () => dueDate,
        deferDate: () => deferDate,
        completionDate: () => completionDate,
        estimatedMinutes: () => 60,
        tags: () => [tag1, tag2],
        containingProject: () => project,
        repetitionRule: () => null,
        added: () => addedDate,
        effectivelyCompleted: () => true,
        blocked: () => false,
        sequential: () => true,
      };

      const adapted = adaptTask(ofTask);
      
      expect(adapted.id).toBe('task-1');
      expect(adapted.name).toBe('Complex Task');
      expect(adapted.note).toBe('Task notes');
      expect(adapted.dueDate).toEqual(dueDate);
      expect(adapted.deferDate).toEqual(deferDate);
      expect(adapted.completionDate).toEqual(completionDate);
      expect(adapted.estimatedMinutes).toBe(60);
      expect(adapted.tags).toEqual(['work', 'urgent']);
      expect(adapted.project).toBe('Test Project');
      expect(adapted.projectId).toBe('proj-1');
      expect(adapted.added).toEqual(addedDate);
    });

    it('should skip analysis when requested', () => {
      const ofTask = {
        id: () => 'task-1',
        name: () => 'Test Task',
        completed: () => false,
        flagged: () => false,
        inInbox: () => true,
        note: () => null,
        dueDate: () => null,
        deferDate: () => null,
        completionDate: () => null,
        estimatedMinutes: () => null,
        tags: () => [],
        containingProject: () => null,
        repetitionRule: () => ({}),
        added: () => null,
        effectivelyCompleted: () => false,
        blocked: () => false,
        sequential: () => false,
      };

      const adapted = adaptTask(ofTask, true);
      
      expect(adapted.recurringStatus).toEqual({
        isRecurring: false,
        type: 'analysis-skipped',
      });
    });

    it('should handle exceptions gracefully', () => {
      const ofTask = {
        id: () => { throw new Error('ID error'); },
        name: () => 'Test Task',
        completed: () => false,
        flagged: () => { throw new Error('Flag error'); },
        inInbox: () => false,
        note: () => null,
        dueDate: () => null,
        deferDate: () => null,
        completionDate: () => null,
        estimatedMinutes: () => null,
        tags: () => [],
        containingProject: () => null,
        repetitionRule: () => null,
        added: () => null,
        effectivelyCompleted: () => false,
        blocked: () => false,
        sequential: () => false,
      };

      const adapted = adaptTask(ofTask);
      
      expect(adapted.id).toBe('unknown');
      expect(adapted.name).toBe('Test Task');
      expect(adapted.flagged).toBe(false);
    });
  });

  describe('Project Adaptation', () => {
    it('should adapt a basic project', () => {
      const ofProject = {
        id: () => 'proj-1',
        name: () => 'Test Project',
        status: () => 'active',
        flagged: () => false,
        note: () => null,
        dueDate: () => null,
        deferDate: () => null,
        completionDate: () => null,
        flattenedTasks: () => [],
        parentFolder: () => null,
        sequential: () => false,
        containsSingletonActions: () => false,
        lastReviewDate: () => null,
        reviewInterval: () => null,
      };

      const adapted = adaptProject(ofProject);
      
      expect(adapted).toMatchObject({
        id: 'proj-1',
        name: 'Test Project',
        status: 'active',
        flagged: false,
        sequential: false,
        containsSingletonActions: false,
        numberOfTasks: 0,
      });
    });

    it('should include stats when requested', () => {
      const task1 = { 
        completed: () => true,
        blocked: () => false,
        effectivelyCompleted: () => true,
      };
      const task2 = { 
        completed: () => false,
        blocked: () => false,
        effectivelyCompleted: () => false,
      };
      const task3 = { 
        completed: () => false,
        blocked: () => true,
        effectivelyCompleted: () => false,
      };
      
      const ofProject = {
        id: () => 'proj-1',
        name: () => 'Test Project',
        status: () => 'active',
        flagged: () => false,
        note: () => null,
        dueDate: () => null,
        deferDate: () => null,
        completionDate: () => null,
        flattenedTasks: () => [task1, task2, task3],
        parentFolder: () => null,
        sequential: () => false,
        containsSingletonActions: () => false,
        lastReviewDate: () => null,
        reviewInterval: () => null,
      };

      const adapted = adaptProject(ofProject, true);
      
      expect(adapted.numberOfTasks).toBe(3);
      expect(adapted.numberOfCompletedTasks).toBe(1);
      expect(adapted.numberOfAvailableTasks).toBe(1);
    });
  });

  describe('Tag Adaptation', () => {
    it('should adapt a basic tag', () => {
      const ofTag = {
        id: () => 'tag-1',
        name: () => 'Test Tag',
        note: () => null,
        allowsNextAction: () => true,
        parent: () => null,
        children: () => [],
      };

      const adapted = adaptTag(ofTag);
      
      expect(adapted).toEqual({
        id: 'tag-1',
        name: 'Test Tag',
        allowsNextAction: true,
        children: [],
      });
    });

    it('should adapt a tag with parent and children', () => {
      const parentTag = { name: () => 'Parent' };
      const child1 = { name: () => 'Child 1' };
      const child2 = { name: () => 'Child 2' };
      
      const ofTag = {
        id: () => 'tag-1',
        name: () => 'Test Tag',
        note: () => 'Tag notes',
        allowsNextAction: () => false,
        parent: () => parentTag,
        children: () => [child1, child2],
      };

      const adapted = adaptTag(ofTag);
      
      expect(adapted.note).toBe('Tag notes');
      expect(adapted.parent).toBe('Parent');
      expect(adapted.children).toEqual(['Child 1', 'Child 2']);
    });
  });

  describe('Batch Adaptation', () => {
    it('should adapt multiple tasks', () => {
      const tasks = [
        {
          id: () => 'task-1',
          name: () => 'Task 1',
          completed: () => false,
          flagged: () => false,
          inInbox: () => true,
          note: () => null,
          dueDate: () => null,
          deferDate: () => null,
          completionDate: () => null,
          estimatedMinutes: () => null,
          tags: () => [],
          containingProject: () => null,
          repetitionRule: () => null,
          added: () => null,
          effectivelyCompleted: () => false,
          blocked: () => false,
          sequential: () => false,
        },
        {
          id: () => 'task-2',
          name: () => 'Task 2',
          completed: () => true,
          flagged: () => true,
          inInbox: () => false,
          note: () => null,
          dueDate: () => null,
          deferDate: () => null,
          completionDate: () => null,
          estimatedMinutes: () => null,
          tags: () => [],
          containingProject: () => null,
          repetitionRule: () => null,
          added: () => null,
          effectivelyCompleted: () => true,
          blocked: () => false,
          sequential: () => false,
        },
      ];

      const adapted = adaptTasks(tasks);
      
      expect(adapted).toHaveLength(2);
      expect(adapted[0].id).toBe('task-1');
      expect(adapted[1].id).toBe('task-2');
    });

    it('should filter out invalid objects', () => {
      const mixed = [
        {
          id: () => 'task-1',
          name: () => 'Valid Task',
          completed: () => false,
          flagged: () => false,
          inInbox: () => false,
          note: () => null,
          dueDate: () => null,
          deferDate: () => null,
          completionDate: () => null,
          estimatedMinutes: () => null,
          tags: () => [],
          containingProject: () => null,
          repetitionRule: () => null,
          added: () => null,
          effectivelyCompleted: () => false,
          blocked: () => false,
          sequential: () => false,
        },
        null,
        {},
        { id: 'not-a-function' },
      ];

      const adapted = adaptTasks(mixed as any);
      
      expect(adapted).toHaveLength(1);
      expect(adapted[0].name).toBe('Valid Task');
    });
  });
});
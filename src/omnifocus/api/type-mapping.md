# OmniFocus API Type Mapping

This document maps between the official OmniFocus API types and our custom types.

## Task Properties

### Official API (Task class)

```typescript
declare class Task extends ActiveObject {
  // Identification
  readonly id: ObjectIdentifier;
  name: string;

  // Dates
  dueDate: Date | null;
  deferDate: Date | null;
  completionDate: Date | null;
  readonly added: Date;
  readonly modified: Date;

  // Status
  flagged: boolean;
  completed: boolean;
  readonly effectivelyCompleted: boolean;
  readonly effectivelyDropped: boolean;
  dropped: boolean;

  // Content
  note: string;
  attachments: Array<FileWrapper>;
  linkedFileURLs: Array<URL>;

  // Organization
  readonly assignedContainer: Project | Task | OmniFocusInbox | null;
  readonly containingProject: Project | null;
  readonly parentTask: Task | null;
  readonly project: Project | null;
  readonly inInbox: boolean;
  sequential: boolean;

  // Tags
  readonly tags: TagArray;
  readonly flattenedTags: TagArray;

  // Repetition
  repetitionRule: Task.RepetitionRule | null;

  // Other
  estimatedMinutes: number | null;
  readonly hasChildren: boolean;
  readonly numberOfChildren: number;
  readonly numberOfAvailableTasks: number;
  readonly numberOfCompletedTasks: number;
}
```

### Our Custom Type (OmniFocusTask interface)

```typescript
export interface OmniFocusTask {
  id: string;
  name: string;
  note?: string;
  project?: string;
  projectId?: string;
  dueDate?: Date;
  deferDate?: Date;
  completionDate?: Date;
  flagged: boolean;
  tags: string[]; // We store tag names, not Tag objects
  estimatedMinutes?: number;
  completed: boolean;
  dropped: boolean;
  effectivelyCompleted: boolean;
  blocked: boolean; // Not in official API
  sequential: boolean;
  inInbox: boolean;

  // Custom recurring task fields
  repetitionRule?: RepetitionRule;
  recurringStatus?: RecurringTaskStatus;

  // Metadata
  added?: Date;
}
```

### Key Differences:

1. **Tags**: Official API returns `TagArray` of `Tag` objects, we convert to string array
2. **Project**: Official API returns `Project` object, we extract name and ID separately
3. **Blocked**: We have a `blocked` field that's not in official API
4. **RecurringStatus**: Our custom analysis field for LLM-friendly recurring info

## Project Properties

### Official API (Project class)

```typescript
declare class Project extends DatabaseObject {
  // Identification
  readonly id: ObjectIdentifier;
  name: string;

  // Dates
  dueDate: Date | null;
  deferDate: Date | null;
  completionDate: Date | null;
  readonly lastModified: Date;

  // Status
  status: Project.Status;
  flagged: boolean;
  readonly completed: boolean;
  readonly dropped: boolean;

  // Content
  note: string;
  attachments: Array<FileWrapper>;

  // Organization
  readonly parentFolder: Folder | null;
  sequential: boolean;
  containsSingletonActions: boolean;
  defaultSingletonActionHolder: boolean;

  // Review
  lastReviewDate: Date | null;
  nextReviewDate: Date | null;
  reviewInterval: ReviewInterval | null;

  // Tasks
  readonly numberOfTasks: number;
  readonly numberOfAvailableTasks: number;
  readonly numberOfCompletedTasks: number;
  readonly hasChildren: boolean;
  readonly children: TaskArray;
  readonly flattenedTasks: TaskArray;

  // Tags
  readonly tags: TagArray;
  readonly flattenedTags: TagArray;
}
```

### Our Custom Type (OmniFocusProject interface)

```typescript
export interface OmniFocusProject {
  id: string;
  name: string;
  note?: string;
  status: 'active' | 'onHold' | 'dropped' | 'completed';
  deferDate?: Date;
  dueDate?: Date;
  completionDate?: Date;
  flagged: boolean;
  sequential: boolean;
  containsSingletonActions: boolean;
  lastReviewDate?: Date;
  reviewInterval?: number; // in days
  folder?: string;
  numberOfTasks: number;
  numberOfAvailableTasks: number;
  numberOfCompletedTasks: number;
}
```

### Key Differences:

1. **Status**: Official API uses `Project.Status` enum, we use string literals
2. **ReviewInterval**: Official API uses `ReviewInterval` object, we extract days as number
3. **Folder**: Official API returns `Folder` object, we extract name as string
4. **Tags**: Not included in our custom type but available in official API

## Tag Properties

### Official API (Tag class)

```typescript
declare class Tag extends ActiveObject {
  // Identification
  readonly id: ObjectIdentifier;
  name: string;

  // Properties
  note: string;
  allowsNextAction: boolean;

  // Hierarchy
  readonly parent: Tag | null;
  readonly children: TagArray;
  readonly flattenedTags: TagArray;

  // Tasks
  readonly availableTasks: TaskArray;
  readonly remainingTasks: TaskArray;
  readonly flattenedTasks: TaskArray;
  readonly projects: ProjectArray;
  readonly flattenedProjects: ProjectArray;
}
```

### Our Custom Type (OmniFocusTag interface)

```typescript
export interface OmniFocusTag {
  id: string;
  name: string;
  note?: string;
  allowsNextAction: boolean;
  parent?: string; // We store parent name, not Tag object
  children: string[]; // We store child names, not Tag objects
}
```

### Key Differences:

1. **Parent/Children**: Official API uses `Tag` objects, we convert to string names
2. **Tasks/Projects**: Not included in our custom type but available in official API

## Method Access Patterns

### Task Methods We Use:

- `task.id()` → `task.id`
- `task.name()` → `task.name`
- `task.note()` → `task.note`
- `task.dueDate()` → `task.dueDate`
- `task.deferDate()` → `task.deferDate`
- `task.completionDate()` → `task.completionDate`
- `task.completed()` → `task.completed`
- `task.flagged()` → `task.flagged`
- `task.dropped()` → `task.dropped`
- `task.effectivelyCompleted()` → `task.effectivelyCompleted`
- `task.inInbox()` → `task.inInbox`
- `task.estimatedMinutes()` → `task.estimatedMinutes`
- `task.added()` → `task.added`
- `task.sequential()` → `task.sequential`
- `task.repetitionRule()` → `task.repetitionRule`
- `task.containingProject()` → `task.containingProject`
- `task.tags()` → `task.tags` (returns TagArray)

### Project Methods We Use:

- `project.id()` → `project.id`
- `project.name()` → `project.name`
- `project.note()` → `project.note`
- `project.status()` → `project.status`
- `project.dueDate()` → `project.dueDate`
- `project.deferDate()` → `project.deferDate`
- `project.completionDate()` → `project.completionDate`
- `project.flagged()` → `project.flagged`
- `project.sequential()` → `project.sequential`
- `project.containsSingletonActions()` → `project.containsSingletonActions`
- `project.lastReviewDate()` → `project.lastReviewDate`
- `project.reviewInterval()` → `project.reviewInterval`
- `project.numberOfTasks()` → `project.numberOfTasks`
- `project.numberOfAvailableTasks()` → `project.numberOfAvailableTasks`
- `project.numberOfCompletedTasks()` → `project.numberOfCompletedTasks`
- `project.parentFolder()` → `project.parentFolder`

### Tag Methods We Use:

- `tag.id()` → `tag.id`
- `tag.name()` → `tag.name`
- `tag.note()` → `tag.note`
- `tag.allowsNextAction()` → `tag.allowsNextAction`
- `tag.parent()` → `tag.parent`
- `tag.tags()` → `tag.children` (note: different property name!)

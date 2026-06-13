import { z } from 'zod';
import type { FilterValue, FlatFilterValue } from '../schemas/read-schema.js';
import type { TagFilter, FolderFilter, PerspectiveFilter } from '../../../contracts/filters.js';

type EmptyInputKey = keyof FlatFilterValue | 'AND' | 'OR' | 'NOT';

/**
 * OMN-161 S1: a query type that supports NO filters yet. Every input key has an
 * explicit 'reject' disposition; `satisfies` makes a future schema field a compile
 * error here until S2 dispositions it (the class-closing pattern; spec P1).
 */
function rejectByDisposition(
  input: FilterValue,
  table: Record<EmptyInputKey, 'reject'>,
  typeName: string,
  steer: string,
): void {
  for (const key of Object.keys(input)) {
    if ((input as Record<string, unknown>)[key] === undefined) continue;
    if ((table as Record<string, 'reject'>)[key] === 'reject') {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: ['query', 'filters', key],
          message: `filters.${key} is not supported on ${typeName} queries. ${steer}`,
        },
      ]);
    }
  }
}

const ALL_REJECT = {
  id: 'reject',
  status: 'reject',
  completed: 'reject',
  tags: 'reject',
  project: 'reject',
  projectId: 'reject',
  parentTaskId: 'reject',
  dueDate: 'reject',
  deferDate: 'reject',
  plannedDate: 'reject',
  completionDate: 'reject',
  added: 'reject',
  flagged: 'reject',
  blocked: 'reject',
  available: 'reject',
  inInbox: 'reject',
  text: 'reject',
  estimatedMinutes: 'reject',
  name: 'reject',
  folder: 'reject',
  AND: 'reject',
  OR: 'reject',
  NOT: 'reject',
} as const satisfies Record<EmptyInputKey, 'reject'>;

export function transformTagFilters(input: FilterValue): TagFilter {
  rejectByDisposition(
    input,
    ALL_REJECT,
    'tags',
    'Tags queries return all tags; filtering by tag name is planned (OMN-161 S2). Remove the filter.',
  );
  return {};
}

export function transformFolderFilters(input: FilterValue): FolderFilter {
  rejectByDisposition(
    input,
    ALL_REJECT,
    'folders',
    'Folders queries return all folders (name-sorted, capped 100); filtering by folder name is planned (OMN-161 S2). Remove the filter.',
  );
  return {};
}

export function transformPerspectiveFilters(input: FilterValue): PerspectiveFilter {
  rejectByDisposition(input, ALL_REJECT, 'perspectives', 'Perspectives queries take no filters. Remove the filter.');
  return {};
}

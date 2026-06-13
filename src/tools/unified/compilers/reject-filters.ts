import { z } from 'zod';
import type { FilterValue, FlatFilterValue } from '../schemas/read-schema.js';
import type { TagFilter, FolderFilter, PerspectiveFilter } from '../../../contracts/filters.js';
import { extractTextCondition } from './filter-merge.js';

type EmptyInputKey = keyof FlatFilterValue | 'AND' | 'OR' | 'NOT';
type Disposition = 'map' | 'reject';

/**
 * OMN-170 (OMN-161 S2): tags/folders queries support a SMALL supported set
 * (name, + folders' parent). Every other input key has an explicit 'reject'
 * disposition; `satisfies Record<EmptyInputKey, Disposition>` makes a future
 * schema field a compile error here until someone dispositions it (the
 * class-closing pattern, mirror of PROJECT_KEY_DISPOSITION; spec P1).
 *
 * Tables are written as FULL literals (every key spelled out) — a spread would
 * defeat the `satisfies` exhaustiveness guarantee.
 */
const TAG_KEY_DISPOSITION = {
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
  name: 'map',
  folder: 'reject',
  AND: 'reject',
  OR: 'reject',
  NOT: 'reject',
} as const satisfies Record<EmptyInputKey, Disposition>;

const FOLDER_KEY_DISPOSITION = {
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
  name: 'map',
  folder: 'map',
  AND: 'reject',
  OR: 'reject',
  NOT: 'reject',
} as const satisfies Record<EmptyInputKey, Disposition>;

const PERSPECTIVE_KEY_DISPOSITION = {
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
} as const satisfies Record<EmptyInputKey, Disposition>;

const TAG_SUPPORTED = 'Supported tags filters: name (e.g. filters: { name: { contains: "..." } }).';
const FOLDER_SUPPORTED =
  'Supported folders filters: name (e.g. filters: { name: { contains: "..." } }), and folder ' +
  '(folder: "<name>" matches the parent folder name; folder: null = top-level folders only).';
const PERSPECTIVE_SUPPORTED = 'Perspectives queries take no filters. Remove the filter.';

/**
 * Reject every present input key whose disposition is not 'map', all named in
 * one error (mirror of transformProjectFilters step 3). Logical operators
 * (AND/OR/NOT) are 'reject' in every table, so they are rejected by the same
 * loop — tags/folders support flat top-level filters only in S2. Undefined-
 * valued keys are skipped (a key present only as `undefined` is not a filter).
 */
function rejectUnsupported(
  input: FilterValue,
  table: Record<EmptyInputKey, Disposition>,
  typeName: string,
  supported: string,
): void {
  const offenders: string[] = [];
  for (const key of Object.keys(input)) {
    if ((input as Record<string, unknown>)[key] === undefined) continue;
    if ((table as Record<string, Disposition>)[key] !== 'map') offenders.push(key);
  }
  if (offenders.length === 0) return;
  const list = offenders.map((k) => `filters.${k}`).join(', ');
  throw new z.ZodError([
    {
      code: z.ZodIssueCode.custom,
      path: ['query', 'filters', offenders[0]],
      message: `${list} ${offenders.length > 1 ? 'are' : 'is'} not supported on ${typeName} queries. ${supported}`,
    },
  ]);
}

type TextFilterInput = { contains?: string; matches?: string } | undefined;

export function transformTagFilters(input: FilterValue): TagFilter {
  rejectUnsupported(input, TAG_KEY_DISPOSITION, 'tags', TAG_SUPPORTED);
  const result: TagFilter = {};
  const nameCond = extractTextCondition(input.name as TextFilterInput);
  if (nameCond) {
    result.name = nameCond.value;
    result.nameOperator = nameCond.operator;
  }
  return result;
}

export function transformFolderFilters(input: FilterValue): FolderFilter {
  rejectUnsupported(input, FOLDER_KEY_DISPOSITION, 'folders', FOLDER_SUPPORTED);
  const result: FolderFilter = {};
  const nameCond = extractTextCondition(input.name as TextFilterInput);
  if (nameCond) {
    result.name = nameCond.value;
    result.nameOperator = nameCond.operator;
  }
  // Mirror the projects mapping (OMN-96): folder:null = top-level only,
  // folder:"<name>" = parent folder name substring.
  if (input.folder === null) {
    result.topLevelOnly = true;
  } else if (typeof input.folder === 'string') {
    result.parentName = input.folder;
  }
  return result;
}

export function transformPerspectiveFilters(input: FilterValue): PerspectiveFilter {
  rejectUnsupported(input, PERSPECTIVE_KEY_DISPOSITION, 'perspectives', PERSPECTIVE_SUPPORTED);
  return {};
}

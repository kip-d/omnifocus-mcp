/**
 * Shared synthetic OmniJS folder tree for OMN-167 emitter tests. Plain objects
 * mirroring the OmniJS `Folder { name, parent }` shape, so generated predicates
 * instantiated via `new Function` can be run over real data. One definition keeps
 * folder-path-match.test.ts and folder-synthetic-fields.test.ts from drifting.
 */
export type FakeFolder = { name: string; parent: FakeFolder | null };

export const development: FakeFolder = { name: 'Development', parent: null };
export const web: FakeFolder = { name: 'Web', parent: development };
export const frontend: FakeFolder = { name: 'Frontend', parent: web };

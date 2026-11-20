/**
 * OMN-328 — scripts/lib/api-snapshot.ts: the optional-before-required normalizer (TS1016 sites seen in the
 * 4.9 and 4.10.1 exports), the header builder, and the token-stream member differ.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readdirSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  selectPreviousVersion,
  selectRetentionDeletions,
  addHeader,
  diffSnapshots,
  extractMembers,
  formatDiff,
  normalizeParamList,
  normalizeText,
  parseExportInfo,
  splitTopLevelParams,
} from '../../../scripts/lib/api-snapshot.js';
import { compareVersions, parseArgs, repointSymlink, UsageError } from '../../../scripts/regen-api-snapshot.js';

describe('normalizeText: the known TS1016 sites', () => {
  const cases: Array<[string, string, string]> = [
    [
      'Application.openDocument',
      'openDocument(from?: Document | null, url: URL, completed: (documentOrError: Document | Error, alreadyOpen: boolean) => void): void;',
      'openDocument(from: Document | null, url: URL, completed: (documentOrError: Document | Error, alreadyOpen: boolean) => void): void;',
    ],
    [
      'FileWrapper.withContents',
      'function withContents(name?: string | null, contents: Data): FileWrapper;',
      'function withContents(name: string | null, contents: Data): FileWrapper;',
    ],
    [
      'FileWrapper.withChildren',
      'function withChildren(name?: string | null, children: Array<FileWrapper>): FileWrapper;',
      'function withChildren(name: string | null, children: Array<FileWrapper>): FileWrapper;',
    ],
    [
      'Form.Field.MultipleOptions constructor',
      'constructor (key: string, displayName?: string | null, options: Array<Object>, names?: Array<string> | null, selected: Array<Object>);',
      'constructor (key: string, displayName: string | null, options: Array<Object>, names: Array<string> | null, selected: Array<Object>);',
    ],
    [
      'Form.Field.Option constructor',
      'constructor (key: string, displayName?: string | null, options: Array<Object>, names?: Array<string> | null, selected?: Object | null, nullOptionTitle?: string | null);',
      'constructor (key: string, displayName: string | null, options: Array<Object>, names?: Array<string> | null, selected?: Object | null, nullOptionTitle?: string | null);',
    ],
    [
      'LanguageModel.Tool constructor',
      'constructor (name: string, description: string, inputSchema?: LanguageModel.Schema | null, f: Function);',
      'constructor (name: string, description: string, inputSchema: LanguageModel.Schema | null, f: Function);',
    ],
    [
      'Settings.setObjectForKey',
      'setObjectForKey(value?: Object | null, key: string): void;',
      'setObjectForKey(value: Object | null, key: string): void;',
    ],
  ];

  it.each(cases)('%s', (_name, input, expected) => {
    expect(normalizeText(`    ${input}`)).toBe(`    ${expected}`);
  });

  it('leaves trailing optional parameters and fully-optional lists alone', () => {
    const lines = [
      'constructor (name: string, position?: Folder | Folder.ChildInsertionLocation | null);',
      'constructor (ruleString?: string | null, method?: Task.RepetitionMethod | null);',
      'show(callback?: (option: number) => void | null): Promise<number>;',
    ].join('\n');
    expect(normalizeText(lines)).toBe(lines);
  });

  it('does not touch // comments', () => {
    const line = '    // Calls f(a?: string, b: number) when invoked';
    expect(normalizeText(line)).toBe(line);
  });

  it('is idempotent', () => {
    const once = normalizeText(cases[0]![1]);
    expect(normalizeText(once)).toBe(once);
  });

  it('normalizes a function-typed parameter that itself has optional-before-required', () => {
    expect(normalizeText('on(cb: (a?: string, b: number) => void): void;')).toBe(
      'on(cb: (a: string, b: number) => void): void;',
    );
  });
});

describe('splitTopLevelParams', () => {
  it('respects nested parens, brackets, generics and arrow types', () => {
    expect(
      splitTopLevelParams('a: Map<string, number>, b: (x: number, y: number) => void, c: [string, number]'),
    ).toEqual(['a: Map<string, number>', ' b: (x: number, y: number) => void', ' c: [string, number]']);
  });

  it('treats rest parameters as non-required', () => {
    expect(normalizeParamList('a?: string, ...rest: Array<string>')).toBe('a?: string, ...rest: Array<string>');
  });
});

describe('header', () => {
  const raw = [
    '// TypeScript definitions for OmniFocus 4.10.1 (190.2) on macOS 27.0.1',
    '// Generated on 2026-11-20 11:23:07 +0000',
    '',
    '// To use these definitions',
  ].join('\n');

  it('parses the version from the first line', () => {
    expect(parseExportInfo(raw).version).toBe('4.10.1');
    expect(parseExportInfo('// TypeScript definitions for OmniFocus 4.9 (187.2.1) on macOS 27').version).toBe('4.9');
  });

  it('rejects an unrecognized export', () => {
    expect(() => parseExportInfo('<html>nope</html>')).toThrow(/Unrecognized export/);
  });

  it('inserts the regen block after the two-line banner', () => {
    const lines = addHeader(raw).split('\n');
    expect(lines.slice(0, 2)).toEqual(raw.split('\n').slice(0, 2));
    expect(lines[3]).toContain('regen-api-snapshot.ts');
    expect(lines.slice(-2)).toEqual(['', '// To use these definitions']);
  });
});

describe('differ', () => {
  const base = [
    '// Alert',
    'declare class Alert {',
    '  // doc',
    '  constructor(title: string, message: string);',
    '  show(callback?: (option: number) => void | null): Promise<number>;',
    '}',
  ].join('\n');

  it('reports no diff for whitespace, wrapping and comment changes', () => {
    const wrapped = [
      'declare class Alert {',
      '    constructor (',
      '      title: string,',
      '      message: string,',
      '    );',
      '    // different comment',
      '    show(',
      '      callback?: (option: number) => void | null',
      '    ): Promise<number>;',
      '}',
    ].join('\n');
    const d = diffSnapshots(base, wrapped);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(formatDiff('a', 'b', d)).toContain('No member changes.');
  });

  it('reports a parameter turning optional <-> required', () => {
    const d = diffSnapshots(base, base.replace('callback?:', 'callback:'));
    expect(d.removed.map((m) => m.text)).toEqual(['show(callback?: (option: number) => void | null): Promise<number>']);
    expect(d.added.map((m) => m.text)).toEqual(['show(callback: (option: number) => void | null): Promise<number>']);
  });

  it('reports a property turning optional <-> required', () => {
    const a = 'declare class T {\n  name?: string;\n}';
    const d = diffSnapshots(a, a.replace('name?:', 'name:'));
    expect(d.removed.map((m) => m.text)).toEqual(['name?: string']);
    expect(d.added.map((m) => m.text)).toEqual(['name: string']);
  });

  it('reports an added member and an added class', () => {
    const next = `${base}\ndeclare class Extra {\n  hello(): void;\n}\n`.replace('show(', 'dismiss(): void;\n  show(');
    const d = diffSnapshots(base, next);
    expect(d.removed).toEqual([]);
    expect(d.added.map((m) => m.text)).toEqual(
      expect.arrayContaining(['dismiss(): void', 'hello(): void', '<type> declare class Extra']),
    );
    expect(d.addedContainers).toEqual(['Extra']);
    expect(formatDiff('a', 'b', d)).toContain('+ Alert: dismiss(): void');
  });

  it('reports a changed signature as remove plus add', () => {
    const d = diffSnapshots(base, base.replace('message: string', 'message: number'));
    expect(d.removed.map((m) => m.text)).toEqual(['constructor(title: string, message: string)']);
    expect(d.added.map((m) => m.text)).toEqual(['constructor(title: string, message: number)']);
  });

  it('tracks nested containers', () => {
    const members = extractMembers('declare namespace A {\n  class B {\n    f(): void;\n  }\n}');
    expect(members.find((m) => m.text === 'f(): void')?.container).toBe('A.B');
  });
});

describe('regen script helpers', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('4.10.1', '4.9')).toBeGreaterThan(0);
    expect(compareVersions('4.8.11', '4.8.6')).toBeGreaterThan(0);
    expect(compareVersions('4.9', '4.9.0')).toBe(0);
  });

  it('parses args and rejects bad ones', () => {
    expect(parseArgs(['--from', 'x.d.ts']).from).toMatch(/x\.d\.ts$/);
    expect(() => parseArgs(['--from'])).toThrow(UsageError);
    expect(() => parseArgs(['--bogus'])).toThrow(UsageError);
  });
});

describe('selectRetentionDeletions', () => {
  it('deletes only versions older than previous', () => {
    expect(selectRetentionDeletions(['4.7', '4.8', '4.9', '4.10.1'], '4.10.1', '4.9')).toEqual(['4.7', '4.8']);
  });

  it('an older export never deletes a newer snapshot', () => {
    // Regenerating 4.8 while 4.9 is current: previous = 4.9, so 4.10.1 and 4.9 both survive.
    expect(selectRetentionDeletions(['4.7', '4.8', '4.9', '4.10.1'], '4.8', '4.9')).toEqual(['4.7']);
  });

  it('keeps the new version and previous, and deletes nothing without a previous', () => {
    expect(selectRetentionDeletions(['4.9', '4.10.1'], '4.10.1', '4.9')).toEqual([]);
    expect(selectRetentionDeletions(['4.9'], '4.10.1', undefined)).toEqual([]);
  });

  it('parses --force', () => {
    expect(parseArgs(['--force']).force).toBe(true);
    expect(parseArgs([]).force).toBe(false);
  });
});

describe('selectPreviousVersion', () => {
  it('prefers the symlink target', () => {
    expect(selectPreviousVersion('4.9', ['4.8', '4.9'], '4.10.1')).toBe('4.9');
  });

  it('falls back to the highest other snapshot when there is no usable symlink target', () => {
    expect(selectPreviousVersion(undefined, ['4.8', '4.10.1', '4.9'], '4.11')).toBe('4.10.1');
  });

  it('ignores a link that names the version being regenerated', () => {
    expect(selectPreviousVersion('4.10.1', ['4.9', '4.10.1'], '4.10.1')).toBe('4.9');
  });

  it('is undefined with nothing else on disk', () => {
    expect(selectPreviousVersion(undefined, [], '4.10.1')).toBeUndefined();
  });
});

describe('committed snapshots', () => {
  it('4.9 vs 4.10.1 report no member changes, ? markers included', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'src', 'omnifocus', 'api');
    const d = diffSnapshots(
      readFileSync(join(dir, 'OmniFocus-4.9-d.ts'), 'utf8'),
      readFileSync(join(dir, 'OmniFocus-4.10.1-d.ts'), 'utf8'),
    );
    expect(formatDiff('4.9', '4.10.1', d)).toContain('No member changes.');
  });
});

describe('non-numeric versions', () => {
  it('parseExportInfo rejects a beta version with guidance', () => {
    expect(() => parseExportInfo('// TypeScript definitions for OmniFocus 4.11b1 (v1)\n')).toThrow(/4\.11b1.*--from/s);
  });
  it('compareVersions throws on a non-numeric segment', () => {
    expect(() => compareVersions('4.11b1', '4.10')).toThrow(/non-numeric/);
    expect(() => compareVersions('4.10', '4.x')).toThrow(/non-numeric/);
    expect(compareVersions('4.10.1', '4.9')).toBeGreaterThan(0);
  });
});

describe('repointSymlink', () => {
  it('replaces an existing link atomically and leaves no temp link', () => {
    const dir = mkdtempSync(join(tmpdir(), 'repoint-'));
    writeFileSync(join(dir, 'a'), 'a');
    writeFileSync(join(dir, 'b'), 'b');
    const link = join(dir, 'OmniFocus.d.ts');
    symlinkSync('a', link);
    repointSymlink(link, 'b');
    expect(readlinkSync(link)).toBe('b');
    expect(readdirSync(dir).sort()).toEqual(['OmniFocus.d.ts', 'a', 'b']);
  });
  it('creates the link when none exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'repoint-'));
    const link = join(dir, 'OmniFocus.d.ts');
    repointSymlink(link, 'b');
    expect(readlinkSync(link)).toBe('b');
  });
  it('keeps the old link and cleans the temp link when the rename fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'repoint-'));
    const link = join(dir, 'OmniFocus.d.ts');
    mkdirSync(link); // renaming a symlink over a directory fails
    expect(() => repointSymlink(link, 'b')).toThrow();
    expect(readdirSync(dir)).toEqual(['OmniFocus.d.ts']);
  });
});

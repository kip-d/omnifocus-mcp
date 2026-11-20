/**
 * OMN-328 — scripts/lib/api-snapshot.ts: the optional-before-required normalizer (TS1016 sites seen in the
 * 4.9 and 4.10.1 exports), the header builder, and the token-stream member differ.
 */
import { describe, it, expect } from 'vitest';
import {
  addHeader,
  diffSnapshots,
  extractMembers,
  formatDiff,
  normalizeParamList,
  normalizeText,
  parseExportInfo,
  splitTopLevelParams,
} from '../../../scripts/lib/api-snapshot.js';
import { compareVersions, parseArgs, UsageError } from '../../../scripts/regen-api-snapshot.js';

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

  it('reports no diff for whitespace, wrapping, comment and ?-marker changes', () => {
    const wrapped = [
      'declare class Alert {',
      '    constructor (',
      '      title: string,',
      '      message: string,',
      '    );',
      '    // different comment',
      '    show(',
      '      callback: (option: number) => void | null',
      '    ): Promise<number>;',
      '}',
    ].join('\n');
    const d = diffSnapshots(base, wrapped);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(formatDiff('a', 'b', d)).toContain('No member changes.');
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

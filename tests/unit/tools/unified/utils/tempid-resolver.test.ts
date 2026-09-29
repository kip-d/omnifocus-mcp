import { describe, it, expect } from 'vitest';
import { TempIdResolver } from '../../../../../src/tools/unified/utils/tempid-resolver.js';

describe('TempIdResolver.getCreatedIds (OMN-345)', () => {
  it('returns created items in resolve (creation) order, not registration (input) order', () => {
    const resolver = new TempIdResolver();
    // Registered in input order: child before parent.
    resolver.register('c', 'task');
    resolver.register('p', 'project');
    resolver.register('f', 'task');
    // Created in dependency order: parent first.
    resolver.resolve('p', 'real-p');
    resolver.resolve('c', 'real-c');
    resolver.markFailed('f', 'boom');

    expect(resolver.getCreatedIds().map((i) => i.tempId)).toEqual(['p', 'c']);
  });

  it('a failed item is excluded even if it was resolved earlier', () => {
    const resolver = new TempIdResolver();
    resolver.register('a', 'task');
    resolver.resolve('a', 'real-a');
    resolver.markFailed('a', 'later failure');

    expect(resolver.getCreatedIds()).toEqual([]);
  });
});

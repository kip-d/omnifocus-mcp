import { describe, it, expect } from 'vitest';
import { OmniAutomation } from '../../src/omnifocus/OmniAutomation.js';

describe('OmniAutomation null/undefined handling', () => {
  it('should handle null params in buildScript', () => {
    const omni = new OmniAutomation();
    
    // This should not throw "Cannot convert undefined or null to object"
    const script1 = omni.buildScript('test {{value}}', null as any);
    expect(script1).toBe('test {{value}}'); // No replacement since params is null
    
    const script2 = omni.buildScript('test {{value}}', undefined as any);
    expect(script2).toBe('test {{value}}'); // No replacement since params is undefined
    
    const script3 = omni.buildScript('test {{value}}', { value: null });
    expect(script3).toBe('test null'); // null value should be formatted as "null"
    
    const script4 = omni.buildScript('test {{value}}', { value: undefined });
    expect(script4).toBe('test null'); // undefined value should be formatted as "null"
  });

  it('should handle null values in formatValue via buildScript', () => {
    const omni = new OmniAutomation();
    
    // Test object with null property
    const script1 = omni.buildScript('test {{obj}}', { obj: { prop: null } });
    expect(script1).toContain('"prop": null');
    
    // Test null object - this was the bug!
    const script2 = omni.buildScript('test {{obj}}', { obj: null });
    expect(script2).toBe('test null');
    
    // Test array with null
    const script3 = omni.buildScript('test {{arr}}', { arr: [1, null, 3] });
    expect(script3).toBe('test [1, null, 3]');
  });

  it('should not throw on edge cases', () => {
    const omni = new OmniAutomation();
    
    // These should all work without throwing
    expect(() => omni.buildScript('test', null as any)).not.toThrow();
    expect(() => omni.buildScript('test', undefined as any)).not.toThrow();
    expect(() => omni.buildScript('test {{val}}', { val: null })).not.toThrow();
    expect(() => omni.buildScript('test {{val}}', { val: undefined })).not.toThrow();
    expect(() => omni.buildScript('test {{val}}', { val: { nested: null } })).not.toThrow();
  });
});
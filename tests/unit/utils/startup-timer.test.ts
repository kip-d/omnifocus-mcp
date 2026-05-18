import { describe, it, expect } from 'vitest';
import { StartupTimer, formatStartupSummary, type StartupMarks } from '../../../src/utils/startup-timer.js';

describe('formatStartupSummary', () => {
  it('renders all six phases for stdio, summing to total', () => {
    const marks: StartupMarks = {
      load: 8210,
      initEnd: 8214,
      permsEnd: 8354,
      warmEnd: 30954,
      registerEnd: 31067,
      ready: 31280,
    };
    const line = formatStartupSummary(marks, 'stdio');
    expect(line).toBe(
      'STARTUP COMPLETE 31280ms  load 8210 · init 4 · perms 140 · warm 22600 · register 113 · ready 213  [stdio]',
    );
    // sum-to-total invariant (rounded parts within phase-count ms of total)
    const pattern = /(?:load|init|perms|warm|register|ready) (\d+)/g;
    const nums: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(line)) !== null) {
      nums.push(Number(m[1]));
    }
    const total = Number(/COMPLETE (\d+)ms/.exec(line)![1]);
    expect(Math.abs(nums.reduce((a, b) => a + b, 0) - total)).toBeLessThanOrEqual(3);
  });

  it('treats missing registerEnd as register 0 (http path) and still sums', () => {
    const marks: StartupMarks = { load: 5000, initEnd: 5002, permsEnd: 5100, warmEnd: 27000, ready: 27210 };
    const line = formatStartupSummary(marks, 'http');
    expect(line).toBe(
      'STARTUP COMPLETE 27210ms  load 5000 · init 2 · perms 98 · warm 21900 · register 0 · ready 210  [http]',
    );
  });

  it('handles warm disabled (warmEnd == permsEnd) as warm 0', () => {
    const marks: StartupMarks = { load: 400, initEnd: 402, permsEnd: 440, warmEnd: 440, registerEnd: 510, ready: 700 };
    expect(formatStartupSummary(marks, 'stdio')).toContain('warm 0 ·');
  });
});

describe('StartupTimer', () => {
  it('captures load at construction and marks via injected clock', () => {
    let t = 100;
    const timer = new StartupTimer(() => t);
    t = 105;
    timer.mark('initEnd');
    t = 250;
    timer.mark('permsEnd');
    t = 9000;
    timer.mark('warmEnd');
    t = 9100;
    timer.mark('registerEnd');
    t = 9300;
    timer.mark('ready');
    expect(timer.summary('stdio')).toBe(
      'STARTUP COMPLETE 9300ms  load 100 · init 5 · perms 145 · warm 8750 · register 100 · ready 200  [stdio]',
    );
  });
});

export type StartupMode = 'stdio' | 'http';
export type StartupCheckpoint = 'initEnd' | 'permsEnd' | 'warmEnd' | 'registerEnd' | 'ready';

export interface StartupMarks {
  /** ms from process start to timer construction (≈ Node bootstrap + ESM import graph). */
  load: number;
  initEnd?: number;
  permsEnd?: number;
  warmEnd?: number;
  registerEnd?: number; // stdio-only; absent in HTTP mode → register renders 0
  ready?: number;
}

/**
 * Pure. Given recorded marks (ms relative to process start) and the server mode,
 * render the single STARTUP COMPLETE line. Phases are consecutive deltas, so
 * load+init+perms+warm+register+ready === total (within rounding). A missing
 * checkpoint collapses its phase to 0 (e.g. HTTP has no registerEnd).
 */
export function formatStartupSummary(marks: StartupMarks, mode: StartupMode): string {
  const initEnd = marks.initEnd ?? marks.load;
  const permsEnd = marks.permsEnd ?? initEnd;
  const warmEnd = marks.warmEnd ?? permsEnd;
  const registerEnd = marks.registerEnd ?? warmEnd;
  const ready = marks.ready ?? registerEnd;

  const load = Math.round(marks.load);
  const init = Math.round(initEnd - marks.load);
  const perms = Math.round(permsEnd - initEnd);
  const warm = Math.round(warmEnd - permsEnd);
  const register = Math.round(registerEnd - warmEnd);
  const readyMs = Math.round(ready - registerEnd);
  const total = Math.round(ready);

  return (
    `STARTUP COMPLETE ${total}ms  load ${load} · init ${init} · perms ${perms} · ` +
    `warm ${warm} · register ${register} · ready ${readyMs}  [${mode}]`
  );
}

export class StartupTimer {
  private readonly marks: StartupMarks;
  private readonly now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
    this.marks = { load: now() };
  }

  mark(checkpoint: StartupCheckpoint): void {
    this.marks[checkpoint] = this.now();
  }

  summary(mode: StartupMode): string {
    return formatStartupSummary(this.marks, mode);
  }
}

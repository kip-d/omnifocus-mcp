/**
 * Shared fake ChildProcess double for unit-testing everything composed over
 * StdioJsonRpcTransport (the transport itself, MCPTester, GherkinTestRunner).
 *
 * ONE copy on purpose (OMN-234 gate review): three per-file near-copies meant
 * a change to the transport's child-process contract (new stream, pid read,
 * exit semantics) could be fixed in one double while the other suites kept
 * passing against a stale one. Extend HERE, not in the test files.
 *
 * Mirrors real Node semantics the transport relies on:
 * - `killed` turns true only via OUR OWN kill() — never on self-exit.
 * - self-exit (crash/clean exit) sets exitCode and fires 'exit'; use
 *   `selfExit()` to emulate it.
 */
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { vi } from 'vitest';

export interface FakeChild extends EventEmitter {
  stdout: PassThrough;
  stdin: PassThrough;
  stderr: PassThrough;
  killed: boolean;
  exitCode: number | null;
  signalCode: string | null;
  kill: (signal?: string) => void;
  /** Emulate the child dying on its own (crash/clean exit) — the case `killed` never reports. */
  selfExit: (code?: number) => void;
  /** Every chunk written to stdin, captured for assertions. */
  writes: string[];
}

export function makeFakeChild(): FakeChild {
  const stdout = new PassThrough();
  const stdin = new PassThrough();
  const stderr = new PassThrough();
  const writes: string[] = [];
  const child = new EventEmitter() as FakeChild;
  child.stdout = stdout;
  child.stdin = stdin;
  child.stderr = stderr;
  child.killed = false;
  child.exitCode = null;
  child.signalCode = null;
  child.writes = writes;
  // Capture writes instead of letting them vanish into a PassThrough with no reader.
  const realWrite = stdin.write.bind(stdin);
  stdin.write = ((chunk: unknown, ...rest: unknown[]) => {
    writes.push(String(chunk));
    return realWrite(chunk as string, ...(rest as []));
  }) as typeof stdin.write;
  child.kill = vi.fn((signal?: string) => {
    child.killed = true;
    process.nextTick(() => {
      child.signalCode = signal ?? 'SIGTERM';
      child.emit('exit', null, child.signalCode);
    });
  });
  child.selfExit = (code = 1) => {
    child.exitCode = code;
    child.emit('exit', code, null);
  };
  return child;
}

/** Push one JSON line onto the child's stdout (a server → client frame). */
export function sendLine(child: FakeChild, obj: unknown): void {
  child.stdout.write(JSON.stringify(obj) + '\n');
}

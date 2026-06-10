/**
 * OMN-143: per-worker orphan guard, loaded via vitest `setupFiles` (runs in
 * EVERY worker, unlike globalSetup which runs only in the vitest main
 * process). No-ops in thread-pool workers (no IPC channel); in forked workers
 * it aborts within seconds of the worker being orphaned — forks are where the
 * destructive afterAll teardowns run, and the 2026-06-09 kill-test showed a
 * fork surviving its dead main at ppid 1.
 */
import { startWorkerOrphanGuard } from './integration-guard.js';

startWorkerOrphanGuard();

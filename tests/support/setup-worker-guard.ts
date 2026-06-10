/**
 * OMN-143: per-worker orphan guard, loaded via vitest `setupFiles` (runs in
 * EVERY worker, unlike globalSetup which runs only in the vitest main
 * process). Arms in forked workers (IPC channel present — and note vitest 3's
 * DEFAULT pool is forks, so this includes unit-test workers: deliberate and
 * harmless, the guard only fires on a ppid TRANSITION to 1). No-ops in
 * worker-thread pools, where no orphan signal exists. Forks are where the
 * destructive afterAll teardowns run; the 2026-06-09 kill-test showed a fork
 * surviving its dead main at ppid 1.
 */
import { startWorkerOrphanGuard } from './integration-guard.js';

startWorkerOrphanGuard();

/**
 * ScriptExecutor -- runs generated JXA/OmniJS scripts via osascript.
 *
 * Design principles:
 * 1. Always write scripts to temp files (never pass via -e flag).
 * 2. Clean up temp files after execution, even on error.
 * 3. Parse JSON output from stdout; stderr is for logging only.
 * 4. Detect script-level errors ({error: true, message: "..."}).
 * 5. Default timeout: 120 seconds.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { GeneratedScript } from './types.js';

const TEMP_DIR = join(tmpdir(), 'omnifocus-cli');
const DEFAULT_TIMEOUT = 120_000; // 2 minutes

export class ScriptExecutor {
  /**
   * Execute a generated script via osascript and return parsed JSON result.
   *
   * - Writes script to temp file (never passes via -e flag)
   * - Cleans up temp file after execution
   * - Parses JSON output
   * - Detects script-level errors ({error: true, message: "..."})
   */
  static async execute<T = unknown>(script: GeneratedScript): Promise<T> {
    mkdirSync(TEMP_DIR, { recursive: true });
    const tempFile = join(TEMP_DIR, `${randomUUID()}.js`);

    try {
      writeFileSync(tempFile, script.source);

      const output = execFileSync('osascript', ['-l', 'JavaScript', tempFile], {
        timeout: DEFAULT_TIMEOUT,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const trimmed = String(output).trim();
      if (!trimmed) {
        throw new Error(`Script returned empty output: ${script.description}`);
      }

      const parsed = JSON.parse(trimmed);

      // Check for script-level errors
      if (parsed && parsed.error === true && parsed.message) {
        throw new Error(parsed.message);
      }

      return parsed as T;
    } catch (err: unknown) {
      if (err instanceof SyntaxError) {
        throw new Error(`Script returned invalid JSON: ${script.description}`);
      }
      if (err instanceof Error) {
        if (
          (err as NodeJS.ErrnoException & { killed?: boolean }).killed ||
          (err as NodeJS.ErrnoException & { signal?: string }).signal === 'SIGTERM'
        ) {
          throw new Error(`Script timeout (${DEFAULT_TIMEOUT}ms): ${script.description}`);
        }
        throw err;
      }
      throw new Error(`Script execution failed: ${script.description}`);
    } finally {
      try {
        unlinkSync(tempFile);
      } catch {
        /* ignore cleanup errors */
      }
    }
  }
}

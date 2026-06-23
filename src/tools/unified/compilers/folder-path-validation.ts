import { z } from 'zod';
import { parseFolderFilterPath } from '../../../contracts/ast/folder-path-match.js';

/**
 * OMN-167: validate a `folder` filter PATH at the compiler boundary (tasks + projects),
 * so an invalid path rejects as a ZodError → VALIDATION_ERROR with steering at compile
 * time. Without this, the only validation was `parseFolderFilterPath` throwing a plain Error
 * deep inside OmniJS code-generation, which BaseTool routes to an opaque EXECUTION_ERROR
 * (and, on the projects side, an empty string was silently skipped → matched all).
 *
 * `parseFolderFilterPath` itself remains the defense-in-depth backstop in the emitter.
 */
export function assertValidFolderPath(path: string, zodPath: (string | number)[]): void {
  try {
    parseFolderFilterPath(path);
  } catch (e) {
    // Re-surface parseFolderFilterPath's own message as a ZodError (single source of
    // truth for the wording) at the supplied path → VALIDATION_ERROR with steering.
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: zodPath,
        message: e instanceof Error ? e.message : `Invalid folder path ${JSON.stringify(path)}.`,
      },
    ]);
  }
}

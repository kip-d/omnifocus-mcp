/**
 * File-based TTL cache for OmniFocus CLI.
 *
 * Caches projects, tags, folders, and analytics to avoid repeated JXA calls.
 * Tasks are NOT cached (always fresh).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Cache entry shape
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expires: number;
}

// ---------------------------------------------------------------------------
// FileCache
// ---------------------------------------------------------------------------

export class FileCache {
  private readonly cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  /**
   * Read a cached value. Returns null if missing or expired.
   */
  get<T>(key: string): T | null {
    const filePath = this.pathFor(key);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const entry: CacheEntry<T> = JSON.parse(raw);

      if (Date.now() > entry.expires) {
        // Expired -- clean up
        try {
          fs.unlinkSync(filePath);
        } catch {
          // Ignore cleanup errors
        }
        return null;
      }

      return entry.data;
    } catch {
      return null;
    }
  }

  /**
   * Write a value to cache with the given TTL in milliseconds.
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    const entry: CacheEntry<T> = {
      data,
      expires: Date.now() + ttlMs,
    };

    const filePath = this.pathFor(key);
    fs.writeFileSync(filePath, JSON.stringify(entry), 'utf-8');
  }

  /**
   * Delete all cache files.
   */
  clear(): void {
    if (!fs.existsSync(this.cacheDir)) {
      return;
    }

    const files = fs.readdirSync(this.cacheDir);
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(this.cacheDir, file));
      } catch {
        // Ignore individual file deletion errors
      }
    }
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /** Sanitize key for filesystem: replace non-alphanumeric chars with _ */
  private sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9]/g, '_');
  }

  /** Full path for a cache key */
  private pathFor(key: string): string {
    return path.join(this.cacheDir, `${this.sanitizeKey(key)}.json`);
  }
}

// ---------------------------------------------------------------------------
// TTL constants
// ---------------------------------------------------------------------------

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const CACHE_TTLS = {
  /** Projects: 5 minutes */
  projects: 5 * MINUTE,
  /** Tags: 10 minutes */
  tags: 10 * MINUTE,
  /** Folders: 10 minutes */
  folders: 10 * MINUTE,
  /** Analytics: 1 hour */
  analytics: 1 * HOUR,
  // tasks: not cached -- always fresh
} as const;

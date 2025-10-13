/**
 * Test Shims for OmniAutomation Mock Compatibility
 *
 * This module provides compatibility shims for test environments where
 * OmniAutomation mocks may not have all methods. These shims ensure that
 * executeJson, execute, and executeTyped methods work consistently.
 *
 * IMPORTANT: This code should ONLY be used in test environments.
 * Production code in BaseTool should not include these shims.
 *
 * Note: This file intentionally uses `any` types for test framework compatibility.
 * ESLint warnings are suppressed for the entire file.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { z } from 'zod';
import type { OmniAutomation } from '../omnifocus/OmniAutomation.js';

// Type definitions for shim logic
type ExecuteFn = (script: string) => Promise<unknown>;

interface GlobalWithVitest {
  vi?: {
    // Vitest integration requires any types for generic function mocking
    fn: <T extends (...args: unknown[]) => unknown>(fn: T) => T;
  };
}

// Type for raw data structure from OmniFocus scripts
interface RawOmniFocusData {
  projects?: unknown[];
  tasks?: unknown[];
  tags?: unknown[];
  perspectives?: unknown[];
  summary?: unknown;
  metadata?: unknown;
  count?: number;
  error?: unknown;
  message?: string;
}

/**
 * Apply compatibility shims to OmniAutomation instance for testing
 *
 * @param omniAutomation - The OmniAutomation instance to enhance
 */
export function applyTestShims(omniAutomation: OmniAutomation): void {
  if (!omniAutomation) return;

  // Capture originals (may be undefined)
  const origExecute: ExecuteFn | undefined =
    typeof omniAutomation.execute === 'function'
      ? omniAutomation.execute.bind(omniAutomation)
      : undefined;

  const origExecuteJson =
    typeof omniAutomation.executeJson === 'function'
      ? omniAutomation.executeJson.bind(omniAutomation)
      : undefined;

  const origExecuteTyped =
    typeof omniAutomation.executeTyped === 'function'
      ? omniAutomation.executeTyped.bind(omniAutomation)
      : undefined;

  // Helper: wrap in vi.fn if available (so tests can assert calls)
  const wrapSpy = <F extends (...args: any[]) => any>(fn: F): F => {
    const g = globalThis as GlobalWithVitest;
    if (g.vi && typeof g.vi.fn === 'function') {
      return g.vi.fn(fn);
    }
    return fn;
  };

  // Ensure executeJson exists (fallback to execute)
  if (!origExecuteJson && origExecute) {
    omniAutomation.executeJson = wrapSpy(async (script: string, schema?: z.ZodTypeAny) => {
      let raw = await origExecute(script);
      if (typeof raw === 'string') {
        try {
          raw = JSON.parse(raw);
        } catch {
          // leave as string
        }
      }

      if (schema && typeof schema.safeParse === 'function') {
        let candidate = raw;
        let parsed = schema.safeParse(candidate);

        if (!parsed.success && raw && typeof raw === 'object') {
          const obj = raw as RawOmniFocusData;
          if (Array.isArray(obj.projects) || Array.isArray(obj.tasks) ||
              Array.isArray(obj.tags) || Array.isArray(obj.perspectives)) {

            candidate = {
              items: Array.isArray(obj.projects)
                ? obj.projects
                : Array.isArray(obj.tasks)
                  ? obj.tasks
                  : Array.isArray(obj.tags)
                    ? obj.tags
                    : obj.perspectives,
              summary: obj.summary,
              metadata: obj.metadata ?? (typeof obj.count === 'number' ? { count: obj.count } : undefined),
            } as any;
            parsed = schema.safeParse(candidate);
          }
        }

        if (parsed.success) {
          return { success: true, data: parsed.data };
        }

        let errMsg = 'Script result validation failed';
        const rawData = raw as RawOmniFocusData;
        if (rawData.error && typeof rawData.message === 'string') {
          errMsg = rawData.message;
        }
        if (raw == null) {
          errMsg = 'NULL_RESULT';
        }

        return {
          success: false,
          error: errMsg,
          details: { errors: parsed.error.issues },
        };
      }

      return { success: true, data: raw };
    });
  }

  // Ensure execute exists (fallback to executeJson)
  if (!origExecute && (origExecuteJson || origExecuteTyped)) {
    omniAutomation.execute = wrapSpy(async (script: string) => {
      if (typeof omniAutomation.executeJson === 'function') {
        const res = await omniAutomation.executeJson(script);
        if (res && res.success) {
          return res.data;
        }
        return {
          error: true,
          message: res?.error ?? 'Script failed',
          details: res?.details,
        };
      }

      if (typeof omniAutomation.executeTyped === 'function') {
        const data = await omniAutomation.executeTyped(script, z.any());
        return data;
      }

      return null;
    });
  }

  // Ensure executeTyped exists (fallback to executeJson or execute)
  if (!origExecuteTyped) {
    if (typeof omniAutomation.executeJson === 'function') {
      omniAutomation.executeTyped = wrapSpy(async (script: string, dataSchema: z.ZodTypeAny) => {
        const res = await omniAutomation.executeJson(script);
        if (!res || !res.success) {
          throw new Error(res?.error ?? 'Script execution failed');
        }
        return dataSchema && typeof dataSchema.parse === 'function'
          ? dataSchema.parse(res.data)
          : res.data;
      });
    } else if (typeof omniAutomation.execute === 'function') {
      omniAutomation.executeTyped = wrapSpy(async (script: string, dataSchema: z.ZodTypeAny) => {
        let raw = await omniAutomation.execute(script);
        if (typeof raw === 'string') {
          try {
            raw = JSON.parse(raw);
          } catch {
            // ignore
          }
        }
        return dataSchema && typeof dataSchema.parse === 'function'
          ? dataSchema.parse(raw)
          : raw;
      });
    }
  }

  // Normalize existing executeJson to return ScriptResult when tests return raw data
  if (origExecuteJson) {
    const prev = origExecuteJson;
    omniAutomation.executeJson = wrapSpy(async (script: string, schema?: z.ZodTypeAny) => {
      const maybe = await prev(script, schema);

      if (maybe && typeof maybe === 'object' && 'success' in maybe) {
        return maybe;
      }

      let raw = maybe as any;
      if (typeof raw === 'string') {
        try {
          raw = JSON.parse(raw);
        } catch {
          // ignore
        }
      }

      if (schema && typeof schema.safeParse === 'function') {
        let candidate = raw;
        let parsed = schema.safeParse(candidate);

        if (!parsed.success && raw && typeof raw === 'object') {
          const obj = raw as RawOmniFocusData;
          if (Array.isArray(obj.projects) || Array.isArray(obj.tasks) ||
              Array.isArray(obj.tags) || Array.isArray(obj.perspectives)) {

            candidate = {
              items: Array.isArray(obj.projects)
                ? obj.projects
                : Array.isArray(obj.tasks)
                  ? obj.tasks
                  : Array.isArray(obj.tags)
                    ? obj.tags
                    : obj.perspectives,
              summary: obj.summary,
              metadata: obj.metadata ?? (typeof obj.count === 'number' ? { count: obj.count } : undefined),
            } as any;
            parsed = schema.safeParse(candidate);
          }
        }

        if (parsed.success) {
          return { success: true, data: parsed.data };
        }

        return {
          success: false,
          error: 'Script result validation failed',
          details: { errors: parsed.error.issues },
        };
      }

      return { success: true, data: raw };
    });
  }
}

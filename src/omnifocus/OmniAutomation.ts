// Defer importing child_process so tests can mock it reliably via vi.mock
// (static ESM imports are evaluated before test mocks are applied)
import { z } from 'zod';
import { createLogger } from '../utils/logger.js';
import { ScriptResult, createScriptSuccess, createScriptError } from './script-result-types.js';
import { JxaEnvelopeSchema, normalizeToEnvelope } from '../utils/safe-io.js';
// Remove conflicting import

// For TypeScript type information about OmniFocus objects, see:
// ./api/OmniFocus.d.ts - Official OmniFocus API types
// ./api/type-adapters.ts - Type conversion utilities

const logger = createLogger('omniautomation');

export class OmniAutomationError extends Error {
  constructor(message: string, public readonly details?: { script?: string; stderr?: string; code?: number }) {
    super(message);
    this.name = 'OmniAutomationError';
  }
}

// Global set to track pending operations - will be set by the server
export let globalPendingOperations: Set<Promise<unknown>> | null = null;

export function setPendingOperationsTracker(tracker: Set<Promise<unknown>>) {
  globalPendingOperations = tracker;
}

export class OmniAutomation {
  private readonly maxScriptSize: number;
  private readonly timeout: number;

  constructor(maxScriptSize?: number, timeout?: number) {
    // Allow configuration via environment variables or constructor parameters
    this.maxScriptSize = maxScriptSize ||
      (process.env.OMNIFOCUS_MAX_SCRIPT_SIZE ? parseInt(process.env.OMNIFOCUS_MAX_SCRIPT_SIZE, 10) : 300000); // Default 300KB to accommodate helper-heavy scripts
    this.timeout = timeout ||
      (process.env.OMNIFOCUS_SCRIPT_TIMEOUT ? parseInt(process.env.OMNIFOCUS_SCRIPT_TIMEOUT, 10) : 120000); // Default 120 seconds
  }

  public async execute<T = unknown>(script: string): Promise<T> {
    console.error(`[OMNI_AUTOMATION_DEBUG] execute called with script length: ${script.length}, max: ${this.maxScriptSize}`);
    if (script.length > this.maxScriptSize) {
      throw new OmniAutomationError(`Script too large: ${script.length} bytes (max: ${this.maxScriptSize})`);
    }

    console.error('[OMNI_AUTOMATION_DEBUG] Script size OK, delegating to executeInternal...');
    const result = await this.executeInternal<T>(script);
    console.error('[OMNI_AUTOMATION_DEBUG] executeInternal returned:', JSON.stringify(result, null, 2));
    return result;
  }

  // New type-safe execution with discriminated unions and schema validation
  public async executeJson<T = unknown>(script: string, schema?: z.ZodSchema<T>): Promise<ScriptResult<T>> {
    console.error(`[OMNI_AUTOMATION_DEBUG] executeJson called with script length: ${script.length}`);
    try {
      console.error('[OMNI_AUTOMATION_DEBUG] About to call execute method...');
      const result = await this.execute<unknown>(script);
      console.error('[OMNI_AUTOMATION_DEBUG] execute method returned:', JSON.stringify(result, null, 2));

      // Handle raw script errors (legacy shape)
      const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
      if (isObj(result) && 'error' in result && (result as Record<string, unknown>).error === true) {
        const obj = result as Record<string, unknown>;
        const msgVal = obj.message;
        const message: string = typeof msgVal === 'string' ? msgVal : 'Script execution failed';
        const details = obj.details ?? 'No additional context';
        return createScriptError(message, 'Legacy script error', details);
      }

      // Validate result against schema if provided
      if (schema) {
        const validation = schema.safeParse(result);
        if (!validation.success) {
          return createScriptError(
            'Script result validation failed',
            `Schema validation errors: ${validation.error.issues.map(i => i.message).join(', ')}`,
            { result, errors: validation.error.issues },
          );
        }
        return createScriptSuccess(validation.data as T);
      }

      console.error('[OMNI_AUTOMATION_DEBUG] Returning success result:', JSON.stringify(result, null, 2));
      return createScriptSuccess(result as T);
    } catch (error) {
      console.error('[OMNI_AUTOMATION_DEBUG] executeJson caught error:', error);
      if (error instanceof OmniAutomationError) {
        return createScriptError(
          error.message,
          'OmniAutomation execution error',
          { script: error.details?.script, stderr: error.details?.stderr },
        );
      }

      return createScriptError(
        error instanceof Error ? error.message : 'Unknown execution error',
        'Unexpected error during script execution',
        error,
      );
    }
  }

  /**
   * Execute a script that returns a standard JXA envelope and decode to typed data.
   * The script must stringify an object of shape { ok: true|false, data|error, v }.
   */
  public async executeTyped<T extends z.ZodTypeAny>(script: string, dataSchema: T): Promise<z.infer<T>> {
    const raw = await this.execute<unknown>(script);
    let env;
    try {
      env = JxaEnvelopeSchema.parse(raw);
    } catch {
      // Fallback for legacy scripts: normalize legacy shapes to envelope
      env = normalizeToEnvelope(raw);
    }
    if (env.ok === false) {
      const msg = env.error.message || 'JXA error';
      const err = new OmniAutomationError(msg, { stderr: typeof env.error.details === 'string' ? env.error.details : undefined });
      throw err;
    }
    // Zod parse returns properly typed data based on schema
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return dataSchema.parse(env.data) as z.infer<T>;
  }

  private async executeInternal<T = unknown>(script: string): Promise<T> {
    console.error(`[OMNI_AUTOMATION_DEBUG] executeInternal called with script length: ${script.length}`);

    // Check if script already has its own IIFE wrapper and app/doc initialization
    const hasIIFE = script.includes('(() =>') || script.includes('(function');
    const hasAppInit = script.includes("Application('OmniFocus')");
    console.error(`[OMNI_AUTOMATION_DEBUG] Script analysis: hasIIFE=${hasIIFE}, hasAppInit=${hasAppInit}`);

    // Tests expect: wrap only if there is no IIFE AND no Application('OmniFocus').
    // If either is present, do not wrap. Always write the chosen (possibly wrapped) script to stdin.
    const wrappedScript = (!hasIIFE && !hasAppInit) ? this.wrapScript(script) : script;
    console.error(`[OMNI_AUTOMATION_DEBUG] Script ${(!hasIIFE && !hasAppInit) ? 'wrapped' : 'not wrapped'}, final length: ${wrappedScript.length}`);

    // Create promise and track it to prevent premature server exit
    const executionPromise = await this.createTrackedExecutionPromise<T>(wrappedScript);
    return executionPromise;
  }

  private async createTrackedExecutionPromise<T>(wrappedScript: string): Promise<T> {
    const { spawn } = await import('node:child_process');

    logger.debug('Executing OmniAutomation script', {
      scriptLength: wrappedScript.length,
    });
    logger.debug('First 500 chars of wrapped script:', wrappedScript.substring(0, 500));

    console.error(`[OMNI_AUTOMATION_DEBUG] Creating Promise with timeout: ${this.timeout}ms`);

    // Create the execution promise
    const promise = new Promise<T>((resolve, reject) => {
      console.error('[OMNI_AUTOMATION_DEBUG] Spawning osascript process...');
      const proc = spawn('osascript', ['-l', 'JavaScript'], {
        timeout: this.timeout,
      });

      console.error('[OMNI_AUTOMATION_DEBUG] Process spawned, PID:', proc.pid);

      let _stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        console.error('[OMNI_AUTOMATION_DEBUG] stdout data received:', data.toString());
        _stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        console.error('[OMNI_AUTOMATION_DEBUG] stderr data received:', data.toString());
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        console.error('[OMNI_AUTOMATION_DEBUG] Process error:', error);
        logger.error('Script execution failed:', error);
        reject(new OmniAutomationError('Failed to execute script', { script: wrappedScript, stderr: error.message }));
      });

      proc.on('close', (code) => {
        console.error('[OMNI_AUTOMATION_DEBUG] Process closed with code:', code);
        if (code !== 0) {
          logger.error('Script execution failed with code:', code);


          reject(new OmniAutomationError(`Script execution failed with code ${code}`, { script: wrappedScript, stderr, code: code || undefined }));
          return;
        }

        if (stderr) {
          logger.warn('Script execution warning:', stderr);
        }

        const trimmedOutput = _stdout.trim();

        if (!trimmedOutput) {
          logger.warn('Script returned empty output, treating as null result');
          resolve(null as T);
          return;
        }

        try {
          const result: unknown = JSON.parse(trimmedOutput);
          const hasError = ((): boolean => {
            if (!result || typeof result !== 'object') return false;
            const obj = result as Record<string, unknown>;
            return Object.prototype.hasOwnProperty.call(obj, 'error');
          })();
          logger.debug('Script execution successful', {
            outputLength: trimmedOutput.length,
            resultType: typeof result,
            hasError,
          });
          resolve(result as T);
        } catch (parseError) {
          logger.error('Failed to parse script output:', {
            output: trimmedOutput.substring(0, 500),
            outputLength: trimmedOutput.length,
            error: parseError,
          });

          // Try to return the raw output if it might be useful
          if (trimmedOutput.includes('{') || trimmedOutput.includes('[')) {
            // Looks like malformed JSON, treat as error
            reject(new OmniAutomationError('Invalid JSON response from script', { script: wrappedScript, stderr: trimmedOutput }));
          } else {
            // Might be a simple string result, wrap it
            resolve(trimmedOutput as T);
          }
        }
      });

      // Write script to stdin
      console.error(`[OMNI_AUTOMATION_DEBUG] Writing script to stdin (${wrappedScript.length} chars)...`);

      // Debug: write the actual script being executed to a file
      try {
        import('fs').then(fs => {
          fs.writeFileSync('/tmp/mcp-debug-script.js', wrappedScript);
          console.error('[OMNI_AUTOMATION_DEBUG] Debug script saved to /tmp/mcp-debug-script.js');
        });
      } catch (e) {
        console.error('[OMNI_AUTOMATION_DEBUG] Could not save debug script:', e instanceof Error ? e.message : String(e));
      }

      proc.stdin.write(wrappedScript);
      console.error('[OMNI_AUTOMATION_DEBUG] Script written, closing stdin...');
      proc.stdin.end();
      console.error('[OMNI_AUTOMATION_DEBUG] stdin closed, waiting for process to complete...');
    });

    // Track this promise to prevent premature server exit
    if (globalPendingOperations) {
      console.error(`[OMNI_AUTOMATION_DEBUG] Adding operation to pending set (current size: ${globalPendingOperations.size})`);
      globalPendingOperations.add(promise);

      // Remove from set when completed (success or failure)
      promise.finally(() => {
        if (globalPendingOperations) {
          globalPendingOperations.delete(promise);
          console.error(`[OMNI_AUTOMATION_DEBUG] Removed operation from pending set (remaining: ${globalPendingOperations.size})`);
        }
      });
    } else {
      console.error('[OMNI_AUTOMATION_DEBUG] Warning: No global pending operations tracker available');
    }

    return promise;
  }

  private wrapScript(script: string): string {
    return `(() => {
      try {
        const app = Application('OmniFocus');
        app.includeStandardAdditions = true;
        
        // Try to activate OmniFocus if needed
        try {
          if (!app.running()) {
            app.activate();
            delay(1); // Give it a moment to start
          }
        } catch (e) {
          // Ignore activation errors
        }
        
        // Use defaultDocument() as a method call instead of property access
        let doc;
        try {
          doc = app.defaultDocument();
        } catch (docError) {
          return JSON.stringify({
            error: true,
            message: "Failed to access OmniFocus document: " + (docError.toString ? docError.toString() : 'Unknown error'),
            details: "app.defaultDocument() threw an error"
          });
        }
        
        // Check if doc is null or undefined
        if (!doc) {
          return JSON.stringify({
            error: true,
            message: "No OmniFocus document available. Please ensure OmniFocus is running and has a document open.",
            details: "app.defaultDocument() returned null or undefined"
          });
        }
        
        // Verify doc is actually usable
        try {
          // Try a simple operation to verify the document is accessible
          doc.name();
        } catch (accessError) {
          return JSON.stringify({
            error: true,
            message: "OmniFocus document is not accessible. The application may be in an invalid state.",
            details: "Cannot access document properties: " + (accessError.toString ? accessError.toString() : 'Unknown error')
          });
        }
        
        // Execute the actual script and return its result
        return ${script}
      } catch (error) {
        const errorMessage = error && error.toString ? error.toString() : 'Unknown error occurred';
        const errorStack = error && error.stack ? error.stack : 'No stack trace available';
        
        return JSON.stringify({
          error: true,
          message: errorMessage,
          stack: errorStack
        });
      }
    })()`;
  }

  // Helper method to build common script patterns
  public buildScript<T extends Record<string, unknown> = Record<string, unknown>>(template: string, params: T = {} as T): string {
    let script = template;

    // Ensure params is not null/undefined
    const safeParams = params || {} as T;

    for (const [key, value] of Object.entries(safeParams)) {
      const placeholder = `{{${key}}}`;
      const replacement = this.formatValue(value);
      script = script.replace(new RegExp(placeholder, 'g'), replacement);
    }

    return script;
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'string') {
      // Escape quotes and special characters in string literals
      return JSON.stringify(value);
    }

    if (value instanceof Date) {
      return `new Date("${value.toISOString()}")`;
    }

    if (Array.isArray(value)) {
      const items = value.map(v => this.formatValue(v)).join(', ');
      return `[${items}]`;
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (typeof value === 'number') {
      return String(value);
    }

    if (typeof value === 'object' && value !== null) {
      // Safely handle objects
      try {
        const entries = Object.entries(value)
          .filter(([, v]) => v !== undefined) // Filter out undefined values
          .map(([k, v]) => `${JSON.stringify(k)}: ${this.formatValue(v)}`)
          .join(', ');
        return `{${entries}}`;
      } catch (error) {
        logger.warn('Failed to format object value:', error);
        return 'null';
      }
    }

    // Handle remaining primitive types (string, number, boolean, etc.)
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  // Execute OmniFocus automation via URL scheme (for operations requiring higher permissions)
  public async executeViaUrlScheme<T = unknown>(script: string): Promise<T> {
    const { spawn } = await import('node:child_process');
    if (script.length > this.maxScriptSize) {
      throw new OmniAutomationError(`Script too large: ${script.length} bytes (max: ${this.maxScriptSize})`);
    }

    // Encode the script for URL scheme execution
    const encodedScript = encodeURIComponent(script);
    const url = `omnifocus:///omnijs-run?script=${encodedScript}`;

    logger.debug('Executing OmniAutomation script via URL scheme', { scriptLength: script.length });

    return new Promise((resolve, reject) => {
      // Use 'open' command to execute URL scheme
      const proc = spawn('open', [url], {
        timeout: this.timeout,
      });

      let _stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        _stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        logger.error('URL scheme execution failed:', error);
        reject(new OmniAutomationError('Failed to execute URL scheme', { script, stderr: error.message }));
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          logger.error('URL scheme execution failed with code:', code);
          reject(new OmniAutomationError(`URL scheme execution failed with code ${code}`, { script, stderr, code: code || undefined }));
          return;
        }

        if (stderr) {
          logger.warn('URL scheme execution warning:', stderr);
        }

        // URL scheme execution doesn't return output directly
        // We'll need to simulate success for operations like complete/delete
        logger.debug('URL scheme execution completed');
        resolve({ success: true } as T);
      });
    });
  }

  public async executeBatch<T = unknown>(scripts: string[]): Promise<T[]> {
    logger.info(`Executing batch of ${scripts.length} scripts`);

    const results: T[] = [];
    const errors: Error[] = [];

    // Execute in parallel with concurrency limit
    const concurrency = 3;
    const chunks: string[][] = [];

    for (let i = 0; i < scripts.length; i += concurrency) {
      chunks.push(scripts.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map(script => this.execute<T>(script)),
      );

      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // Promise rejection reason can be any type
          errors.push(result.reason instanceof Error ? result.reason : new Error(String(result.reason)));
        }
      }
    }

    if (errors.length > 0) {
      logger.warn(`Batch execution completed with ${errors.length} errors`);
    }

    return results;
  }
}

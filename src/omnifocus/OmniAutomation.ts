import { spawn } from 'node:child_process';
import { createLogger } from '../utils/logger.js';

// For TypeScript type information about OmniFocus objects, see:
// ./api/OmniFocus.d.ts - Official OmniFocus API types
// ./api/type-adapters.ts - Type conversion utilities

const logger = createLogger('omniautomation');

export class OmniAutomationError extends Error {
  constructor(message: string, public readonly script?: string, public readonly stderr?: string) {
    super(message);
    this.name = 'OmniAutomationError';
  }
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
    if (script.length > this.maxScriptSize) {
      throw new OmniAutomationError(`Script too large: ${script.length} bytes (max: ${this.maxScriptSize})`);
    }

    return this.executeInternal<T>(script);
  }

  private async executeInternal<T = unknown>(script: string): Promise<T> {
    // Check if script already has its own IIFE wrapper and app/doc initialization
    const hasIIFE = script.includes('(() =>') || script.includes('(function');
    const hasAppInit = script.includes("Application('OmniFocus')");

    // Only wrap if the script doesn't already have its own structure
    const wrappedScript = hasIIFE && hasAppInit ? script : this.wrapScript(script);

    logger.debug('Executing OmniAutomation script', {
      scriptLength: script.length,
      hasIIFE,
      hasAppInit,
      wrapped: wrappedScript !== script,
    });
    logger.debug('First 500 chars of wrapped script:', wrappedScript.substring(0, 500));

    return new Promise((resolve, reject) => {
      const proc = spawn('osascript', ['-l', 'JavaScript'], {
        timeout: this.timeout,
      });

      let _stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        _stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        logger.error('Script execution failed:', error);
        reject(new OmniAutomationError('Failed to execute script', script, error.message));
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          logger.error('Script execution failed with code:', code);


          reject(new OmniAutomationError(`Script execution failed with code ${code}`, script, stderr));
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
          const result = JSON.parse(trimmedOutput);
          logger.debug('Script execution successful', {
            outputLength: trimmedOutput.length,
            resultType: typeof result,
            hasError: result && result.error ? true : false,
          });
          resolve(result);
        } catch (parseError) {
          logger.error('Failed to parse script output:', {
            output: trimmedOutput.substring(0, 500),
            outputLength: trimmedOutput.length,
            error: parseError,
          });

          // Try to return the raw output if it might be useful
          if (trimmedOutput.includes('{') || trimmedOutput.includes('[')) {
            // Looks like malformed JSON, treat as error
            reject(new OmniAutomationError('Invalid JSON response from script', script, trimmedOutput));
          } else {
            // Might be a simple string result, wrap it
            resolve(trimmedOutput as T);
          }
        }
      });

      // Write script to stdin
      proc.stdin.write(wrappedScript);
      proc.stdin.end();
    });
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

    return String(value);
  }

  // Execute OmniFocus automation via URL scheme (for operations requiring higher permissions)
  public async executeViaUrlScheme<T = any>(script: string): Promise<T> {
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

      proc.stdout.on('data', (data) => {
        _stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        logger.error('URL scheme execution failed:', error);
        reject(new OmniAutomationError('Failed to execute URL scheme', script, error.message));
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          logger.error('URL scheme execution failed with code:', code);
          reject(new OmniAutomationError(`URL scheme execution failed with code ${code}`, script, stderr));
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

  public async executeBatch<T = any>(scripts: string[]): Promise<T[]> {
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
          errors.push(result.reason);
        }
      }
    }

    if (errors.length > 0) {
      logger.warn(`Batch execution completed with ${errors.length} errors`);
    }

    return results;
  }
}

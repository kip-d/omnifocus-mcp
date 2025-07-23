import { spawn } from 'node:child_process';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('omniautomation');

export class OmniAutomationError extends Error {
  constructor(message: string, public readonly script?: string, public readonly stderr?: string) {
    super(message);
    this.name = 'OmniAutomationError';
  }
}

export class OmniAutomation {
  private readonly maxScriptSize = 100000; // 100KB limit for scripts
  private readonly timeout = 60000; // 60 second timeout (increased for reliability)

  public async execute<T = unknown>(script: string): Promise<T> {
    if (script.length > this.maxScriptSize) {
      throw new OmniAutomationError(`Script too large: ${script.length} bytes (max: ${this.maxScriptSize})`);
    }

    return this.executeInternal<T>(script);
  }

  private async executeInternal<T = unknown>(script: string): Promise<T> {
    const wrappedScript = this.wrapScript(script);

    logger.debug('Executing OmniAutomation script', { scriptLength: script.length });
    logger.debug('First 500 chars of wrapped script:', wrappedScript.substring(0, 500));

    return new Promise((resolve, reject) => {
      const proc = spawn('osascript', ['-l', 'JavaScript'], {
        timeout: this.timeout,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
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

        const trimmedOutput = stdout.trim();

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
            hasError: result && result.error ? true : false
          });
          resolve(result);
        } catch (parseError) {
          logger.error('Failed to parse script output:', { 
            output: trimmedOutput.substring(0, 500), 
            outputLength: trimmedOutput.length,
            error: parseError 
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
        // Use defaultDocument() as a method call instead of property access
        const doc = app.defaultDocument();
        
        // Check if doc is null or undefined
        if (!doc) {
          return JSON.stringify({
            error: true,
            message: "No OmniFocus document available. Please ensure OmniFocus is running and has a document open.",
            details: "app.defaultDocument() returned null or undefined"
          });
        }
        
        ${script}
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

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
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

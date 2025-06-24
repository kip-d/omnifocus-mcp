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
  private readonly timeout = 30000; // 30 second timeout

  public async execute<T = any>(script: string): Promise<T> {
    if (script.length > this.maxScriptSize) {
      throw new OmniAutomationError(`Script too large: ${script.length} bytes (max: ${this.maxScriptSize})`);
    }

    const wrappedScript = this.wrapScript(script);
    
    logger.debug('Executing OmniAutomation script', { scriptLength: script.length });

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

        try {
          const result = JSON.parse(stdout.trim());
          logger.debug('Script execution successful');
          resolve(result);
        } catch (parseError) {
          logger.error('Failed to parse script output:', stdout);
          reject(new OmniAutomationError('Invalid JSON response from script', script, stdout));
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
        const doc = app.defaultDocument;
        
        ${script}
      } catch (error) {
        return JSON.stringify({
          error: true,
          message: error.toString(),
          stack: error.stack
        });
      }
    })()`;
  }

  // Helper method to build common script patterns
  public buildScript(template: string, params: Record<string, any> = {}): string {
    let script = template;
    
    for (const [key, value] of Object.entries(params)) {
      const placeholder = `{{${key}}}`;
      const replacement = this.formatValue(value);
      script = script.replace(new RegExp(placeholder, 'g'), replacement);
    }
    
    return script;
  }

  private formatValue(value: any): string {
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
    
    if (typeof value === 'object') {
      const entries = Object.entries(value)
        .map(([k, v]) => `${JSON.stringify(k)}: ${this.formatValue(v)}`)
        .join(', ');
      return `{${entries}}`;
    }
    
    return String(value);
  }

  // Utility method for batch operations
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
        chunk.map(script => this.execute<T>(script))
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
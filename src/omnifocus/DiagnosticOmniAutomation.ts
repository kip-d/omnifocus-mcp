import { spawn } from 'node:child_process';
import { OmniAutomation, OmniAutomationError } from './OmniAutomation.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('diagnostic-omniautomation');

export class DiagnosticOmniAutomation extends OmniAutomation {
  private diagnosticLog: string[] = [];
  
  private log(message: string, data?: any) {
    const logEntry = `[${new Date().toISOString()}] ${message}${data ? ': ' + JSON.stringify(data) : ''}`;
    this.diagnosticLog.push(logEntry);
    logger.info(message, data || {});
  }

  getDiagnosticLog(): string[] {
    return this.diagnosticLog;
  }

  async execute<T = any>(script: string): Promise<T> {
    this.log('Starting script execution', { scriptLength: script.length });
    
    // Access maxScriptSize through parent class method or hardcode it
    const maxSize = 100000; // Same as parent class
    if (script.length > maxSize) {
      this.log('Script too large', { scriptLength: script.length, maxSize });
      throw new OmniAutomationError(`Script too large: ${script.length} bytes (max: ${maxSize})`);
    }

    return this.executeDiagnostic<T>(script);
  }

  private async executeDiagnostic<T = any>(script: string): Promise<T> {
    const wrappedScript = this.wrapScriptWithDiagnostics(script);
    
    this.log('Wrapped script created', { wrappedLength: wrappedScript.length });
    this.log('First 500 chars of wrapped script', wrappedScript.substring(0, 500));

    return new Promise((resolve, reject) => {
      const proc = spawn('osascript', ['-l', 'JavaScript'], {
        timeout: 60000, // 60 second timeout
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        this.log('Received stdout chunk', { length: chunk.length });
      });

      proc.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        this.log('Received stderr chunk', { length: chunk.length, content: chunk });
      });

      proc.on('error', (error) => {
        this.log('Process error', { error: error.message });
        reject(new OmniAutomationError('Failed to execute script', script, error.message));
      });

      proc.on('close', (code) => {
        this.log('Process closed', { code, stdoutLength: stdout.length, stderrLength: stderr.length });
        
        if (code !== 0) {
          this.log('Script execution failed with non-zero code', { code, stderr });
          reject(new OmniAutomationError(`Script execution failed with code ${code}`, script, stderr));
          return;
        }

        if (stderr) {
          this.log('Script execution warning', { stderr });
        }

        const trimmedOutput = stdout.trim();
        
        if (!trimmedOutput) {
          this.log('Script returned empty output');
          resolve(null as T);
          return;
        }

        this.log('Attempting to parse output', { outputLength: trimmedOutput.length });

        try {
          const result = JSON.parse(trimmedOutput);
          this.log('Successfully parsed output', { 
            resultType: typeof result,
            hasError: result && result.error ? true : false,
            errorMessage: result && result.error ? result.message : undefined
          });
          
          // Log diagnostic info from the script if available
          if (result && result.diagnostics) {
            this.log('Script diagnostics received', result.diagnostics);
          }
          
          resolve(result);
        } catch (parseError: any) {
          this.log('Failed to parse JSON output', { 
            parseError: parseError.message,
            outputSample: trimmedOutput.substring(0, 200)
          });
          
          if (trimmedOutput.includes('{') || trimmedOutput.includes('[')) {
            reject(new OmniAutomationError('Invalid JSON response from script', script, trimmedOutput));
          } else {
            resolve(trimmedOutput as T);
          }
        }
      });

      // Write script to stdin
      this.log('Writing script to stdin');
      proc.stdin.write(wrappedScript);
      proc.stdin.end();
    });
  }

  private wrapScriptWithDiagnostics(script: string): string {
    return `(() => {
      const diagnostics = [];
      
      function logDiagnostic(step, data) {
        diagnostics.push({
          step: step,
          timestamp: new Date().toISOString(),
          data: data
        });
      }
      
      try {
        logDiagnostic('start', { scriptStarted: true });
        
        const app = Application('OmniFocus');
        logDiagnostic('app_created', { 
          appType: typeof app,
          hasName: typeof app.name !== 'undefined'
        });
        
        // Use defaultDocument() as a method call instead of property access
        const doc = app.defaultDocument();
        logDiagnostic('doc_retrieved', { 
          docType: typeof doc,
          docNull: doc === null,
          docUndefined: doc === undefined,
          docTruthy: doc ? true : false
        });
        
        // Check if doc is null or undefined
        if (!doc) {
          return JSON.stringify({
            error: true,
            message: "No OmniFocus document available. Please ensure OmniFocus is running and has a document open.",
            details: "app.defaultDocument() returned null or undefined",
            diagnostics: diagnostics
          });
        }
        
        logDiagnostic('before_script', { docAvailable: true });
        
        // Execute the actual script
        const scriptResult = (() => {
          ${script}
        })();
        
        logDiagnostic('after_script', { 
          resultType: typeof scriptResult,
          resultLength: scriptResult && scriptResult.length ? scriptResult.length : undefined
        });
        
        // Parse the result if it's a string
        if (typeof scriptResult === 'string') {
          try {
            const parsed = JSON.parse(scriptResult);
            parsed.diagnostics = diagnostics;
            return JSON.stringify(parsed);
          } catch (e) {
            logDiagnostic('parse_error', { error: e.toString() });
            return scriptResult;
          }
        } else {
          return JSON.stringify({
            result: scriptResult,
            diagnostics: diagnostics
          });
        }
      } catch (error) {
        logDiagnostic('wrapper_error', { 
          error: error.toString(),
          stack: error.stack,
          message: error.message
        });
        
        const errorMessage = error && error.toString ? error.toString() : 'Unknown error occurred';
        const errorStack = error && error.stack ? error.stack : 'No stack trace available';
        
        return JSON.stringify({
          error: true,
          message: errorMessage,
          stack: errorStack,
          diagnostics: diagnostics
        });
      }
    })()`;
  }
}
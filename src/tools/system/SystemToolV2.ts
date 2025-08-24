import { z } from 'zod';
import { BaseTool } from '../base.js';
import { getVersionInfo } from '../../utils/version.js';
import {
  createSuccessResponseV2,
  createErrorResponseV2,
  OperationTimerV2,
} from '../../utils/response-format-v2.js';
import { DiagnosticOmniAutomation } from '../../omnifocus/DiagnosticOmniAutomation.js';
import { SystemResponseV2 } from '../response-types-v2.js';

const SystemToolSchemaV2 = z.object({
  operation: z.enum(['version', 'diagnostics']).default('version')
    .describe('Operation to perform: version info or diagnostics'),
  testScript: z.string().optional().describe('For diagnostics: optional test script identifier'),
});

export type SystemArgsV2 = z.infer<typeof SystemToolSchemaV2>;

export class SystemToolV2 extends BaseTool<typeof SystemToolSchemaV2, SystemResponseV2> {
  name = 'system';
  description = 'System operations for OmniFocus MCP. Operations: version (server info) or diagnostics (connection tests).';
  schema = SystemToolSchemaV2;

  private diagnosticOmni: DiagnosticOmniAutomation;

  constructor(cache: any) {
    super(cache);
    this.diagnosticOmni = new DiagnosticOmniAutomation();
  }

  async executeValidated(args: SystemArgsV2): Promise<SystemResponseV2> {
    const timer = new OperationTimerV2();

    if (args.operation === 'diagnostics') {
      return this.handleDiagnostics(args, timer);
    }

    return this.handleVersion(timer);
  }

  private async handleVersion(timer: OperationTimerV2): Promise<SystemResponseV2> {
    try {
      const info = getVersionInfo();
      return createSuccessResponseV2(
        'system',
        info,
        undefined,
        { ...timer.toMetadata(), operation: 'version' }
      );
    } catch (error) {
      return createErrorResponseV2(
        'system',
        'VERSION_ERROR',
        error instanceof Error ? error.message : String(error),
        undefined,
        undefined,
        { ...timer.toMetadata(), operation: 'version' }
      );
    }
  }

  private async handleDiagnostics(args: SystemArgsV2, timer: OperationTimerV2): Promise<SystemResponseV2> {
    try {
      const basicScript = `
        return JSON.stringify({
          appName: app.name(),
          documentExists: typeof doc !== 'undefined'
        });
      `;
      const result = await this.diagnosticOmni.execute<any>(basicScript);
      let parsed: any;
      try {
        parsed = typeof result === 'string' ? JSON.parse(result) : result;
      } catch {
        parsed = { raw: result };
      }

      const data = {
        timestamp: new Date().toISOString(),
        basic: parsed,
        testScript: args.testScript,
      };

      return createSuccessResponseV2(
        'system',
        data,
        undefined,
        { ...timer.toMetadata(), operation: 'diagnostics' }
      );
    } catch (error) {
      return createErrorResponseV2(
        'system',
        'DIAGNOSTIC_ERROR',
        error instanceof Error ? error.message : String(error),
        'Check OmniFocus permissions',
        undefined,
        { ...timer.toMetadata(), operation: 'diagnostics' }
      );
    }
  }
}


import { z } from 'zod';
import { BaseTool } from '../base.js';
import { getVersionInfo } from '../../utils/version.js';
import { createSuccessResponse, OperationTimer } from '../../utils/response-format.js';
import { GetVersionInfoSchema } from '../schemas/system-schemas.js';

export class GetVersionInfoTool extends BaseTool<typeof GetVersionInfoSchema> {
  name = 'get_version_info';
  description = 'Get MCP server version info including version number, git commit hash, build timestamp, and environment details. Useful for debugging and support.';
  schema = GetVersionInfoSchema;

  async executeValidated(_args: z.infer<typeof GetVersionInfoSchema>): Promise<any> {
    const timer = new OperationTimer();

    try {
      const versionInfo = getVersionInfo();
      return createSuccessResponse(
        'get_version_info',
        versionInfo,
        timer.toMetadata(),
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}

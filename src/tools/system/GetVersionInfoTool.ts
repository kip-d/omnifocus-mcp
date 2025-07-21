import { BaseTool } from '../base.js';
import { getVersionInfo } from '../../utils/version.js';
import { createSuccessResponse, OperationTimer } from '../../utils/response-format.js';

export class GetVersionInfoTool extends BaseTool {
  name = 'get_version_info';
  description = 'Get version information including git commit hash and build details';
  
  inputSchema = {
    type: 'object' as const,
    properties: {},
  };

  async execute(): Promise<any> {
    const timer = new OperationTimer();
    
    try {
      const versionInfo = getVersionInfo();
      return createSuccessResponse(
        'get_version_info',
        versionInfo,
        timer.toMetadata()
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}
import { BaseTool } from '../base.js';
import { getVersionInfo } from '../../utils/version.js';

export class GetVersionInfoTool extends BaseTool {
  name = 'get_version_info';
  description = 'Get version information including git commit hash and build details';
  
  inputSchema = {
    type: 'object' as const,
    properties: {},
  };

  async execute(): Promise<any> {
    try {
      return getVersionInfo();
    } catch (error) {
      return this.handleError(error);
    }
  }
}
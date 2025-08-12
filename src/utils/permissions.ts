import { execSync } from 'child_process';
import { createLogger } from './logger.js';

const logger = createLogger('PermissionChecker');

export interface PermissionStatus {
  hasPermission: boolean;
  error?: string;
  instructions?: string;
}

export class PermissionChecker {
  private static instance: PermissionChecker;
  private permissionStatus: PermissionStatus | null = null;

  static getInstance(): PermissionChecker {
    if (!PermissionChecker.instance) {
      PermissionChecker.instance = new PermissionChecker();
    }
    return PermissionChecker.instance;
  }

  /**
   * Check if we have permission to access OmniFocus
   */
  checkPermissions(): PermissionStatus {
    // Return cached result if we've already checked
    if (this.permissionStatus !== null) {
      return this.permissionStatus;
    }

    try {
      // Simple test to see if we can access OmniFocus
      execSync(
        'osascript -e \'tell application "OmniFocus" to return name of default document\'',
        { encoding: 'utf8', stdio: 'pipe' },
      );

      logger.info('OmniFocus permissions verified');
      this.permissionStatus = { hasPermission: true };
      return this.permissionStatus;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for specific permission error codes
      if (errorMessage.includes('-1743') || errorMessage.includes('not allowed')) {
        logger.error('OmniFocus permission denied');
        this.permissionStatus = {
          hasPermission: false,
          error: 'Not authorized to send Apple events to OmniFocus',
          instructions: this.getPermissionInstructions(),
        };
      } else if (errorMessage.includes('-600') || errorMessage.includes("isn't running")) {
        logger.error('OmniFocus is not running');
        this.permissionStatus = {
          hasPermission: false,
          error: 'OmniFocus is not running',
          instructions: 'Please start OmniFocus and try again.',
        };
      } else {
        logger.error('Unknown error checking permissions:', errorMessage);
        this.permissionStatus = {
          hasPermission: false,
          error: 'Failed to check OmniFocus permissions',
          instructions: 'Please ensure OmniFocus is installed and try again.',
        };
      }

      return this.permissionStatus;
    }
  }

  /**
   * Reset cached permission status (useful after user grants permissions)
   */
  resetCache(): void {
    this.permissionStatus = null;
  }

  private getPermissionInstructions(): string {
    return `To grant permissions:
1. You may see a permission dialog - click "OK" to grant access
2. Or manually grant permissions:
   - Open System Settings → Privacy & Security → Automation
   - Find the app using this MCP server (Claude Desktop, Terminal, etc.)
   - Enable the checkbox next to OmniFocus
3. After granting permissions, try your request again`;
  }
}

/**
 * Convenience function to check permissions
 */
export async function checkOmniFocusPermissions(): Promise<PermissionStatus> {
  return PermissionChecker.getInstance().checkPermissions();
}

/**
 * Create a permission error response for MCP tools
 */
export function createPermissionErrorResponse(status: PermissionStatus): any {
  return {
    error: true,
    message: status.error || 'Permission denied',
    instructions: status.instructions,
    code: 'PERMISSION_DENIED',
  };
}

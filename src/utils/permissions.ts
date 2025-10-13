import { execFile } from 'child_process';
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
  private lastCheckedAt: number | null = null;
  private ttlMs: number = 15_000; // short TTL to avoid frequent prompts

  static getInstance(): PermissionChecker {
    if (!PermissionChecker.instance) {
      PermissionChecker.instance = new PermissionChecker();
    }
    return PermissionChecker.instance;
  }

  /**
   * Check if we have permission to access OmniFocus
   */
  async checkPermissions(): Promise<PermissionStatus> {
    // Return cached result if within TTL
    const now = Date.now();
    if (
      this.permissionStatus !== null &&
      this.lastCheckedAt !== null &&
      now - this.lastCheckedAt < this.ttlMs
    ) {
      return this.permissionStatus;
    }

    const cmd = 'osascript';
    const args = ['-e', 'tell application "OmniFocus" to return name of default document'];

    const status = await new Promise<PermissionStatus>((resolve) => {
      const child = execFile(cmd, args, { timeout: 3_000 }, (error) => {
        if (!error) {
          resolve({ hasPermission: true });
          return;
        }

        // Error objects from external processes can be any type
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const msg = error instanceof Error ? error.message : String(error);

        if (msg.includes('-1743') || msg.includes('not allowed')) {
          resolve({
            hasPermission: false,
            error: 'Not authorized to send Apple events to OmniFocus',
            instructions: this.getPermissionInstructions(),
          });
        } else if (msg.includes('-600') || msg.includes("isn't running")) {
          resolve({
            hasPermission: false,
            error: 'OmniFocus is not running',
            instructions: 'Please start OmniFocus and try again.',
          });
        } else if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
          resolve({
            hasPermission: false,
            error: 'Timed out checking OmniFocus permissions',
            instructions: 'Ensure OmniFocus is responsive and try again.',
          });
        } else {
          resolve({
            hasPermission: false,
            error: 'Failed to check OmniFocus permissions',
            instructions: 'Please ensure OmniFocus is installed and try again.',
          });
        }
      });

      // Safety: kill process on hard timeout to avoid hangs
      child.on('error', () => {/* handled in callback */});
    });

    // Log concise status
    if (status.hasPermission) {
      logger.info('OmniFocus permissions verified');
    } else {
      logger.warn('OmniFocus permissions not granted or unavailable');
    }

    this.permissionStatus = status;
    this.lastCheckedAt = Date.now();
    return status;
  }

  /**
   * Reset cached permission status (useful after user grants permissions)
   */
  resetCache(): void {
    this.permissionStatus = null;
    this.lastCheckedAt = null;
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


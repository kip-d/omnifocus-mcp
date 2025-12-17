/**
 * Test Environment Detection Utilities
 * Helps tests determine if they should run or be skipped based on available resources
 */

export interface EnvironmentInfo {
  isOmniFocusRunning: boolean;
  isOmniFocusDocumentOpen: boolean;
  hasTestData: boolean;
  nodeVersion: string;
  platform: string;
}

export class TestEnvironment {
  private static environmentInfo: EnvironmentInfo | null = null;

  /**
   * Check if OmniFocus is running and accessible
   */
  static async isOmniFocusRunning(): Promise<boolean> {
    try {
      // Quick check using osascript to see if OmniFocus is running
      const { execSync } = await import('child_process');
      const result = execSync(
        'osascript -e "tell application \"System Events\" to get name of every process whose background only is false"',
        { encoding: 'utf8' },
      );
      return result.toLowerCase().includes('omnifocus');
    } catch {
      return false;
    }
  }

  /**
   * Check if OmniFocus has an open document
   */
  static async isOmniFocusDocumentOpen(): Promise<boolean> {
    try {
      const { execSync } = await import('child_process');
      const result = execSync('osascript -e "tell application \"OmniFocus\" to get name of every document"', {
        encoding: 'utf8',
      });
      return result.trim().length > 0 && !result.includes('error');
    } catch {
      return false;
    }
  }

  /**
   * Get comprehensive environment information
   */
  static async getEnvironmentInfo(): Promise<EnvironmentInfo> {
    if (this.environmentInfo) {
      return this.environmentInfo;
    }

    const [isOmniFocusRunning, isOmniFocusDocumentOpen] = await Promise.all([
      this.isOmniFocusRunning(),
      this.isOmniFocusDocumentOpen(),
    ]);

    this.environmentInfo = {
      isOmniFocusRunning,
      isOmniFocusDocumentOpen,
      hasTestData: isOmniFocusRunning && isOmniFocusDocumentOpen,
      nodeVersion: process.version,
      platform: process.platform,
    };

    return this.environmentInfo;
  }

  /**
   * Skip test if OmniFocus is not available
   */
  static skipIfNoOmniFocus(testName: string, testFn: () => void | Promise<void>): void {
    test.skipIf(!this.isOmniFocusRunning(), testName, testFn);
  }

  /**
   * Skip test if OmniFocus document is not open
   */
  static skipIfNoDocument(testName: string, testFn: () => void | Promise<void>): void {
    test.skipIf(!this.isOmniFocusDocumentOpen(), testName, testFn);
  }

  /**
   * Log environment information for debugging
   */
  static logEnvironmentInfo(): void {
    console.log('🔍 Test Environment Info:');
    console.log(`   Node.js: ${process.version}`);
    console.log(`   Platform: ${process.platform}`);
    console.log(`   OmniFocus Running: ${this.environmentInfo?.isOmniFocusRunning ? '✅' : '❌'}`);
    console.log(`   Document Open: ${this.environmentInfo?.isOmniFocusDocumentOpen ? '✅' : '❌'}`);
  }
}

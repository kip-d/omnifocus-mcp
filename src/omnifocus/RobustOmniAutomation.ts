import { OmniAutomation, OmniAutomationError } from './OmniAutomation.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('robust-omniautomation');

/**
 * Robust version of OmniAutomation that handles connection issues and retries
 */
export class RobustOmniAutomation extends OmniAutomation {
  private lastSuccessTime: number = Date.now();
  private consecutiveFailures: number = 0;
  private readonly maxConsecutiveFailures: number = 3;
  private readonly connectionTimeout: number = 5 * 60 * 1000; // 5 minutes

  async execute<T = any>(script: string): Promise<T> {
    // Check if we need to test the connection
    const timeSinceLastSuccess = Date.now() - this.lastSuccessTime;
    if (timeSinceLastSuccess > this.connectionTimeout) {
      logger.warn('Connection may be stale, testing connection first', {
        timeSinceLastSuccess,
        lastSuccessTime: new Date(this.lastSuccessTime).toISOString(),
      });

      // Test connection with a simple script
      const testResult = await this.testConnection();
      if (!testResult) {
        throw new OmniAutomationError(
          'Connection test failed - OmniFocus may be unresponsive',
          script,
          'Connection timeout after ' + Math.round(timeSinceLastSuccess / 1000) + ' seconds',
        );
      }
    }

    try {
      const result = await super.execute<T>(script);

      // Reset failure counter on success
      this.consecutiveFailures = 0;
      this.lastSuccessTime = Date.now();

      return result;
    } catch (error: any) {
      this.consecutiveFailures++;

      // Log detailed error information
      logger.error('Script execution failed', {
        consecutiveFailures: this.consecutiveFailures,
        timeSinceLastSuccess: Date.now() - this.lastSuccessTime,
        errorMessage: error.message,
        errorType: error.constructor.name,
      });

      // If we've had too many consecutive failures, try to diagnose
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        const diagnosis = await this.diagnoseConnection();
        logger.error('Connection diagnosis after repeated failures', diagnosis);

        throw new OmniAutomationError(
          `Script execution failed after ${this.consecutiveFailures} attempts. ${diagnosis.summary}`,
          script,
          JSON.stringify(diagnosis),
        );
      }

      // For "Cannot convert undefined or null to object" errors, add more context
      if (error.message && error.message.includes('Cannot convert undefined or null to object')) {
        const enhancedError = new OmniAutomationError(
          `${error.message} - This often indicates OmniFocus has become unresponsive or the document is no longer available`,
          script,
          error.stderr || error.message,
        );
        throw enhancedError;
      }

      throw error;
    }
  }

  private async testConnection(): Promise<boolean> {
    const testScript = `
      return JSON.stringify({
        success: true,
        appAvailable: typeof app !== 'undefined',
        docAvailable: typeof doc !== 'undefined' && doc !== null,
        timestamp: new Date().toISOString()
      });
    `;

    try {
      const result = await super.execute<any>(testScript);
      return result && result.success && result.docAvailable;
    } catch (error) {
      logger.error('Connection test failed', { error });
      return false;
    }
  }

  private async diagnoseConnection(): Promise<any> {
    const diagnosis: any = {
      timestamp: new Date().toISOString(),
      consecutiveFailures: this.consecutiveFailures,
      timeSinceLastSuccess: Date.now() - this.lastSuccessTime,
      tests: {},
    };

    // Test 1: Can we create app reference?
    try {
      const appTest = await super.execute<any>(`
        return JSON.stringify({
          canCreateApp: typeof Application !== 'undefined',
          appName: typeof app !== 'undefined' ? app.name() : 'no app'
        });
      `);
      diagnosis.tests.appCreation = { success: true, result: appTest };
    } catch (error: any) {
      diagnosis.tests.appCreation = { success: false, error: error.message };
    }

    // Test 2: Can we access document?
    try {
      const docTest = await super.execute<any>(`
        const testApp = Application('OmniFocus');
        const testDoc = testApp.defaultDocument();
        return JSON.stringify({
          docType: typeof testDoc,
          docNull: testDoc === null,
          docUndefined: testDoc === undefined
        });
      `);
      diagnosis.tests.documentAccess = { success: true, result: docTest };
    } catch (error: any) {
      diagnosis.tests.documentAccess = { success: false, error: error.message };
    }

    // Test 3: Can we access collections with fresh references?
    try {
      const collectionTest = await super.execute<any>(`
        const freshApp = Application('OmniFocus');
        const freshDoc = freshApp.defaultDocument();
        if (!freshDoc) {
          return JSON.stringify({ error: 'No document' });
        }
        
        let results = {};
        try {
          const tasks = freshDoc.flattenedTasks();
          results.tasks = { accessible: true, type: typeof tasks };
        } catch (e) {
          results.tasks = { accessible: false, error: e.toString() };
        }
        
        return JSON.stringify(results);
      `);
      diagnosis.tests.collectionAccess = { success: true, result: collectionTest };
    } catch (error: any) {
      diagnosis.tests.collectionAccess = { success: false, error: error.message };
    }

    // Generate summary
    const allTestsFailed = Object.values(diagnosis.tests).every((test: any) => !test.success);
    if (allTestsFailed) {
      diagnosis.summary = 'Complete connection failure - OmniFocus may need to be restarted';
    } else if (!diagnosis.tests.documentAccess?.success) {
      diagnosis.summary = 'Document access failed - OmniFocus document may be closed';
    } else if (!diagnosis.tests.collectionAccess?.success) {
      diagnosis.summary = 'Collection access failed - Possible permission or state issue';
    } else {
      diagnosis.summary = 'Partial connection failure - Intermittent issue detected';
    }

    return diagnosis;
  }

}

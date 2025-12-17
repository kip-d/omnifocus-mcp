/**
 * Error Filtering Utilities for Tests
 * Reduces noise from expected test errors and provides clean test output
 */

export interface ErrorFilter {
  pattern: RegExp;
  description: string;
  expected: boolean;
}

export class TestErrorFilter {
  private static filters: ErrorFilter[] = [
    // Expected test errors from error testing tools
    {
      pattern: /ErrorTestTool.*Error in error-test-tool/,
      description: 'Expected error testing tool errors',
      expected: true,
    },
    {
      pattern: /ThrowingTool.*Throwing MCP error/,
      description: 'Expected error throwing tool errors',
      expected: true,
    },
    {
      pattern: /TestTool.*Failed to log tool failure/,
      description: 'Expected test tool logging failures',
      expected: true,
    },
    // Expected connection test failures
    {
      pattern: /robust-omniautomation.*Connection test failed/,
      description: 'Expected connection test failures',
      expected: true,
    },
    {
      pattern: /robust-omniautomation.*Connection may be stale/,
      description: 'Expected connection staleness warnings',
      expected: true,
    },
    // Expected script execution failures in test scenarios
    {
      pattern: /omniautomation.*Script execution failed with code: \[1\]/,
      description: 'Expected script execution failures in tests',
      expected: true,
    },
    // Performance test warnings
    {
      pattern: /Failed to parse date.*in timezone/,
      description: 'Expected timezone parsing warnings',
      expected: true,
    },
  ];

  /**
   * Filter out expected errors from test output
   */
  static filterExpectedErrors(logs: string[]): string[] {
    return logs.filter((log) => {
      // Check if this log matches any expected error pattern
      const isExpected = this.filters.some((filter) => filter.pattern.test(log));
      return !isExpected;
    });
  }

  /**
   * Get summary of filtered errors
   */
  static getFilteredErrorSummary(logs: string[]): {
    total: number;
    filtered: number;
    remaining: number;
    filteredTypes: string[];
  } {
    const total = logs.length;
    const filtered = logs.filter((log) => this.filters.some((filter) => filter.pattern.test(log))).length;
    const remaining = total - filtered;

    const filteredTypes = this.filters
      .filter((filter) => logs.some((log) => filter.pattern.test(log)))
      .map((filter) => filter.description);

    return {
      total,
      filtered,
      remaining,
      filteredTypes,
    };
  }

  /**
   * Add a custom error filter
   */
  static addFilter(filter: ErrorFilter): void {
    this.filters.push(filter);
  }

  /**
   * Get all current filters
   */
  static getFilters(): ErrorFilter[] {
    return [...this.filters];
  }

  /**
   * Clear all filters
   */
  static clearFilters(): void {
    this.filters = [];
  }
}

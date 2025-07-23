/**
 * Plugin system for recurring task analysis
 */

export * from './types.js';
export * from './PluginRegistry.js';
export * from './CoreRecurringAnalyzer.js';
export * from './GamingRecurringAnalyzer.js';

import { recurringTaskRegistry } from './PluginRegistry.js';
import { CoreRecurringAnalyzer } from './CoreRecurringAnalyzer.js';
import { GamingRecurringAnalyzer } from './GamingRecurringAnalyzer.js';

/**
 * Initialize the plugin system with default analyzers
 */
export function initializeRecurringTaskPlugins(): void {
  // Register the gaming analyzer (higher priority)
  recurringTaskRegistry.register(new GamingRecurringAnalyzer());

  // Register the core analyzer (lower priority, fallback)
  recurringTaskRegistry.register(new CoreRecurringAnalyzer());
}

// Export the registry for use in scripts
export { recurringTaskRegistry };

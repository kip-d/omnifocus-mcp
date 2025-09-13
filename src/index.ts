#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/index.js';
import { registerPrompts } from './prompts/index.js';
import { CacheManager } from './cache/CacheManager.js';
import { PermissionChecker } from './utils/permissions.js';
import { createLogger } from './utils/logger.js';
import { getVersionInfo } from './utils/version.js';
import { setPendingOperationsTracker } from './omnifocus/OmniAutomation.js';

const logger = createLogger('server');

// Create server instance
const versionInfo = getVersionInfo();
const server = new Server(
  {
    name: 'omnifocus-mcp-cached',
    version: versionInfo.version,
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
    },
  },
);

// Track pending async operations to prevent premature exit
const pendingOperations = new Set<Promise<any>>();

// Start server
async function runServer() {
  // Initialize pending operations tracking
  setPendingOperationsTracker(pendingOperations);
  
  // Initialize cache manager
  const cacheManager = new CacheManager();

  // Log version information at debug level
  try {
    const versionInfo = getVersionInfo();
    logger.debug(`Starting ${versionInfo.name} v${versionInfo.version} (build: ${versionInfo.build.buildId})`);
  } catch (error) {
    logger.debug('Failed to get version info:', error);
  }

  // Perform initial permission check (non-blocking)
  const permissionChecker = PermissionChecker.getInstance();
  try {
    const result = await permissionChecker.checkPermissions();
    if (!result.hasPermission) {
      logger.warn('OmniFocus permissions not granted. Tools will provide instructions when used.');
      if (result.instructions) {
        logger.info('Permission instructions:', result.instructions);
      }
    } else {
      logger.info('OmniFocus permissions verified');
    }
  } catch (error) {
    logger.error('Failed to check permissions:', error);
  }

  // Register all tools and prompts AFTER server creation but BEFORE connection
  await registerTools(server, cacheManager);
  registerPrompts(server);

  const transport = new StdioServerTransport();

  // Handle stdin closure for proper MCP lifecycle compliance  
  // Wait for pending operations before exiting
  const gracefulExit = async (reason: string) => {
    logger.info(`${reason}, waiting for pending operations to complete...`);
    
    if (pendingOperations.size > 0) {
      logger.info(`Waiting for ${pendingOperations.size} pending operations...`);
      try {
        await Promise.allSettled([...pendingOperations]);
        logger.info('All pending operations completed');
      } catch (error) {
        logger.error('Error waiting for pending operations:', error);
      }
    }
    
    logger.info('Exiting gracefully per MCP specification');
    process.exit(0);
  };
  
  process.stdin.on('end', () => {
    gracefulExit('stdin closed');
  });

  process.stdin.on('close', () => {
    gracefulExit('stdin stream closed');
  });

  // Handle EPIPE errors when Claude Desktop disconnects abruptly
  process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') {
      logger.info('stdout EPIPE - client disconnected, exiting gracefully');
      process.exit(0);
    } else {
      logger.error('stdout error:', err);
      process.exit(1);
    }
  });

  process.stderr.on('error', (err) => {
    if (err.code === 'EPIPE') {
      logger.info('stderr EPIPE - client disconnected, exiting gracefully');
      process.exit(0);
    } else {
      console.error('stderr error:', err);
      process.exit(1);
    }
  });

  // Handle EPIPE errors when Claude Desktop disconnects abruptly
  process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') {
      logger.info('stdout EPIPE - client disconnected, exiting gracefully');
      process.exit(0);
    } else {
      logger.error('stdout error:', err);
      process.exit(1);
    }
  });

  process.stderr.on('error', (err) => {
    if (err.code === 'EPIPE') {
      logger.info('stderr EPIPE - client disconnected, exiting gracefully');
      process.exit(0);
    } else {
      console.error('stderr error:', err);
      process.exit(1);
    }
  });

  await server.connect(transport);
}

runServer().catch((error) => {
  console.error('Server startup error:', error);
  process.exit(1);
});

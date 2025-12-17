import { createLogger } from './logger.js';

const logger = createLogger('cli');

/**
 * CLI configuration for the server
 */
export interface CLIConfig {
  httpMode: boolean;
  port: number;
  host: string;
  authToken?: string;
}

/**
 * Default CLI configuration values
 */
export const DEFAULT_CLI_CONFIG: CLIConfig = {
  httpMode: false,
  port: 3000,
  host: '0.0.0.0',
};

/**
 * Parses command line arguments and environment variables
 * to determine server configuration
 */
export function parseCLIArgs(): CLIConfig {
  const args = process.argv.slice(2);
  const config: CLIConfig = { ...DEFAULT_CLI_CONFIG };

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--http':
        config.httpMode = true;
        break;
      case '--port':
        if (i + 1 < args.length) {
          const portValue = args[i + 1];
          if (!portValue.startsWith('--')) {
            const port = parseInt(portValue, 10);
            if (!isNaN(port) && port > 0 && port < 65536) {
              config.port = port;
              i++; // Skip next argument
            } else {
              logger.warn(`Invalid port value: ${portValue}, using default: ${config.port}`);
            }
          }
        }
        break;
      case '--host':
        if (i + 1 < args.length) {
          const hostValue = args[i + 1];
          if (!hostValue.startsWith('--')) {
            config.host = hostValue;
            i++; // Skip next argument
          }
        }
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }

  // Check environment variables (override command line args)
  if (process.env.MCP_AUTH_TOKEN) {
    config.authToken = process.env.MCP_AUTH_TOKEN;
  }

  if (process.env.MCP_PORT) {
    const port = parseInt(process.env.MCP_PORT, 10);
    if (!isNaN(port) && port > 0 && port < 65536) {
      config.port = port;
    } else {
      logger.warn(`Invalid MCP_PORT value: ${process.env.MCP_PORT}, using default: ${config.port}`);
    }
  }

  if (process.env.MCP_HOST) {
    config.host = process.env.MCP_HOST;
  }

  // Log configuration in debug mode
  logger.debug('CLI Configuration:', {
    httpMode: config.httpMode,
    port: config.port,
    host: config.host,
    authToken: config.authToken ? '[REDACTED]' : undefined,
  });

  return config;
}

/**
 * Validates the CLI configuration
 */
export function validateCLIConfig(config: CLIConfig): void {
  if (config.httpMode) {
    if (config.port <= 0 || config.port >= 65536) {
      throw new Error(`Invalid port: ${config.port}. Port must be between 1 and 65535.`);
    }

    if (!config.host || config.host.trim() === '') {
      throw new Error('Host cannot be empty in HTTP mode.');
    }
  }
}

/**
 * Prints help information for the CLI
 */
export function printHelp(): void {
  console.log(`
Usage: omnifocus-mcp-cached [options]

Options:
  --http              Enable HTTP transport instead of stdio
  --port <port>       HTTP server port (default: 3000)
  --host <host>       Bind address (default: 0.0.0.0)
  -h, --help          Show this help message

Environment Variables:
  MCP_AUTH_TOKEN      Bearer token for authentication (optional)
  MCP_PORT            Alternative to --port flag
  MCP_HOST            Alternative to --host flag
  MCP_SKIP_AUTO_START Skip automatic server startup (for testing)

Examples:
  # Current stdio mode (unchanged)
  node dist/index.js

  # New HTTP mode
  node dist/index.js --http --port 3000
  node dist/index.js --http --port 3000 --host 127.0.0.1

  # Using environment variables
  export MCP_AUTH_TOKEN=$(openssl rand -hex 32)
  export MCP_PORT=3000
  node dist/index.js --http
`);
}

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
function parsePort(value: string, label: string, fallback: number): number {
  const port = parseInt(value, 10);
  if (!isNaN(port) && port > 0 && port < 65536) return port;
  logger.warn(`Invalid ${label} value: ${value}, using default: ${fallback}`);
  return fallback;
}

function consumeNextArg(args: string[], i: number): string | null {
  if (i + 1 >= args.length) return null;
  const next = args[i + 1];
  return next.startsWith('--') ? null : next;
}

export function parseCLIArgs(): CLIConfig {
  const args = process.argv.slice(2);
  const config: CLIConfig = { ...DEFAULT_CLI_CONFIG };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--http':
        config.httpMode = true;
        break;
      case '--port': {
        const val = consumeNextArg(args, i);
        if (val) {
          config.port = parsePort(val, 'port', config.port);
          i++;
        }
        break;
      }
      case '--host': {
        const val = consumeNextArg(args, i);
        if (val) {
          config.host = val;
          i++;
        }
        break;
      }
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }

  // Environment variables override command line args
  if (process.env.MCP_AUTH_TOKEN) config.authToken = process.env.MCP_AUTH_TOKEN;
  if (process.env.MCP_PORT) config.port = parsePort(process.env.MCP_PORT, 'MCP_PORT', config.port);
  if (process.env.MCP_HOST) config.host = process.env.MCP_HOST;

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

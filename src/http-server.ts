import { createServer, IncomingMessage, ServerResponse, Server as HttpServer } from 'node:http';
import { URL } from 'node:url';
import { createLogger } from './utils/logger.js';
import { SessionManager } from './session-manager.js';
import { randomUUID } from 'node:crypto';
import { getVersionInfo } from './utils/version.js';

const logger = createLogger('http-server');

export class HttpServerManager {
  private httpServer: HttpServer;
  private sessionManager: SessionManager;
  private port: number;
  private host: string;
  private authToken?: string;

  constructor(sessionManager: SessionManager, port: number, host: string, authToken?: string) {
    this.sessionManager = sessionManager;
    this.port = port;
    this.host = host;
    this.authToken = authToken;

    // Create HTTP server
    this.httpServer = createServer(this.handleRequest.bind(this));

    // Handle server errors
    this.httpServer.on('error', (error) => {
      logger.error('HTTP server error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    });

    // Handle server listening
    this.httpServer.on('listening', () => {
      const address = this.httpServer.address();
      logger.info('HTTP server listening', {
        port: this.port,
        host: this.host,
        address: typeof address === 'object' ? address : undefined,
      });
    });

    // Handle server close
    this.httpServer.on('close', () => {
      logger.info('HTTP server closed');
    });
  }

  /**
   * Starts the HTTP server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer.listen(this.port, this.host, () => {
          logger.info('HTTP server started successfully', {
            port: this.port,
            host: this.host,
          });
          resolve();
        });
      } catch (error) {
        logger.error('Failed to start HTTP server', {
          error: error instanceof Error ? error.message : String(error),
        });
        reject(error);
      }
    });
  }

  /**
   * Stops the HTTP server gracefully
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.httpServer.listening) {
        logger.info('HTTP server not running, skip stopping');
        resolve();
        return;
      }

      this.httpServer.close((error) => {
        if (error) {
          logger.error('Error stopping HTTP server', {
            error: error instanceof Error ? error.message : String(error),
          });
          reject(error);
        } else {
          logger.info('HTTP server stopped successfully');
          resolve();
        }
      });
    });
  }

  /**
   * Handles incoming HTTP requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const startTime = Date.now();
      const requestId = randomUUID();

      logger.debug('Incoming request', {
        requestId,
        method: req.method,
        url: req.url,
        headers: this.getSafeHeaders(req.headers),
      });

      // Handle CORS preflight requests
      if (req.method === 'OPTIONS') {
        this.handleOptionsRequest(req, res);
        return;
      }

      // Validate authentication if required
      if (this.authToken && !this.validateAuthentication(req)) {
        logger.warn('Unauthorized request', { requestId });
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized', message: 'Authentication required' }));
        return;
      }

      // Parse URL to handle query strings and trailing slashes
      const parsedUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const pathname = parsedUrl.pathname.replace(/\/$/, '') || '/';

      // Route requests based on pathname
      switch (pathname) {
        case '/mcp':
          await this.handleMcpRequest(req, res, requestId);
          break;
        case '/health':
          this.handleHealthRequest(req, res);
          break;
        case '/sessions':
          this.handleSessionsRequest(req, res);
          break;
        default:
          this.handleNotFoundRequest(req, res);
          break;
      }

      const duration = Date.now() - startTime;
      logger.debug('Request completed', {
        requestId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        durationMs: duration,
      });
    } catch (error) {
      logger.error('Error handling request', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', message: 'Request processing failed' }));
    }
  }

  /**
   * Handles OPTIONS requests for CORS
   */
  private handleOptionsRequest(_req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Session-Id, MCP-Protocol-Version',
      'Access-Control-Max-Age': '86400',
      'Content-Length': '0',
    });
    res.end();
  }

  /**
   * Validates authentication token from Authorization header
   */
  private validateAuthentication(_req: IncomingMessage): boolean {
    if (!this.authToken) {
      return true; // No auth required
    }

    const authHeader = _req.headers['authorization'];
    if (!authHeader) {
      return false;
    }

    // Extract bearer token
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match || !match[1]) {
      return false;
    }

    const token = match[1];
    return this.sessionManager.validateAuthToken(token);
  }

  /**
   * Handles MCP endpoint requests
   */
  private async handleMcpRequest(_req: IncomingMessage, res: ServerResponse, requestId: string): Promise<void> {
    const sessionId = _req.headers['mcp-session-id'] as string | undefined;

    // Handle different HTTP methods for MCP endpoint
    switch (_req.method) {
      case 'POST':
        await this.handleMcpPostRequest(_req, res, sessionId, requestId);
        break;
      case 'GET':
        await this.handleMcpGetRequest(_req, res, sessionId, requestId);
        break;
      case 'DELETE':
        await this.handleMcpDeleteRequest(_req, res, sessionId, requestId);
        break;
      default:
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method Not Allowed', message: 'Only POST, GET, and DELETE are supported' }));
        break;
    }
  }

  /**
   * Handles POST requests to /mcp endpoint
   */
  private async handleMcpPostRequest(
    _req: IncomingMessage,
    res: ServerResponse,
    sessionId: string | undefined,
    requestId: string,
  ): Promise<void> {
    try {
      // Parse request body
      let body: unknown;
      try {
        body = await this.parseRequestBody(_req);
      } catch (error) {
        if (error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE') {
          logger.warn('Request body too large', { requestId });
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload Too Large', message: 'Request body exceeds maximum size' }));
          return;
        }
        throw error;
      }
      if (!body) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Request', message: 'Request body is required' }));
        return;
      }

      let session = sessionId ? this.sessionManager.getSession(sessionId) : undefined;

      // Create new session if no session ID provided or session doesn't exist
      if (!session) {
        const newSessionId = randomUUID();
        session = await this.sessionManager.createSession(newSessionId);
        logger.info('Created new session for request', { requestId, sessionId: newSessionId });
      }

      // Handle the request using the session's transport
      await session.transport.handleRequest(_req, res, body);

      // Update session activity
      this.sessionManager.updateSessionActivity(session.sessionId);
    } catch (error) {
      logger.error('Error handling MCP POST request', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', message: 'Failed to process MCP request' }));
    }
  }

  /**
   * Handles GET requests to /mcp endpoint (SSE stream)
   */
  private async handleMcpGetRequest(
    _req: IncomingMessage,
    res: ServerResponse,
    sessionId: string | undefined,
    requestId: string,
  ): Promise<void> {
    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request', message: 'Session ID is required for GET requests' }));
      return;
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found', message: 'Session not found' }));
      return;
    }

    try {
      // Handle the request using the session's transport
      await session.transport.handleRequest(_req, res);
      this.sessionManager.updateSessionActivity(session.sessionId);
    } catch (error) {
      logger.error('Error handling MCP GET request', {
        requestId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', message: 'Failed to process MCP GET request' }));
    }
  }

  /**
   * Handles DELETE requests to /mcp endpoint (session termination)
   */
  private async handleMcpDeleteRequest(
    _req: IncomingMessage,
    res: ServerResponse,
    sessionId: string | undefined,
    requestId: string,
  ): Promise<void> {
    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request', message: 'Session ID is required for DELETE requests' }));
      return;
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found', message: 'Session not found' }));
      return;
    }

    try {
      // Handle the request using the session's transport
      await session.transport.handleRequest(_req, res);
      logger.info('Session terminated via DELETE request', { requestId, sessionId });
    } catch (error) {
      logger.error('Error handling MCP DELETE request', {
        requestId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', message: 'Failed to process MCP DELETE request' }));
    }
  }

  /**
   * Handles health check requests
   */
  private handleHealthRequest(_req: IncomingMessage, res: ServerResponse): void {
    try {
      const versionInfo = getVersionInfo();
      const healthResponse = {
        status: 'ok',
        version: versionInfo.version,
        timestamp: new Date().toISOString(),
        sessions: this.sessionManager.getSessionCount(),
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(healthResponse, null, 2));
    } catch (error) {
      logger.error('Error handling health request', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', error: 'Internal Server Error' }));
    }
  }

  /**
   * Handles sessions info requests
   */
  private handleSessionsRequest(_req: IncomingMessage, res: ServerResponse): void {
    if (_req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed', message: 'Only GET is supported' }));
      return;
    }

    try {
      const stats = this.sessionManager.getStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats, null, 2));
    } catch (error) {
      logger.error('Error handling sessions request', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', message: 'Failed to get session information' }));
    }
  }

  /**
   * Handles 404 Not Found requests
   */
  private handleNotFoundRequest(_req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found', message: 'Endpoint not found' }));
  }

  // Maximum request body size (5MB - generous for JSON-RPC payloads)
  private static readonly MAX_BODY_SIZE = 5 * 1024 * 1024;

  /**
   * Parses request body as JSON with size limit enforcement
   */
  private async parseRequestBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = '';
      let size = 0;

      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > HttpServerManager.MAX_BODY_SIZE) {
          req.destroy();
          reject(new Error('PAYLOAD_TOO_LARGE'));
          return;
        }
        body += chunk.toString();
      });

      req.on('end', () => {
        if (!body) {
          resolve(null);
          return;
        }

        try {
          const parsed: unknown = JSON.parse(body);
          resolve(parsed);
        } catch (error) {
          logger.debug('Failed to parse request body as JSON', {
            error: error instanceof Error ? error.message : String(error),
          });
          resolve(null);
        }
      });

      req.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Gets safe headers for logging (redacts sensitive info)
   */
  private getSafeHeaders(headers: IncomingMessage['headers']): Record<string, string> {
    const safeHeaders: Record<string, string> = {};
    const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie'];

    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        if (typeof value === 'string') {
          if (sensitiveHeaders.includes(key.toLowerCase())) {
            safeHeaders[key] = '[REDACTED]';
          } else {
            safeHeaders[key] = value;
          }
        } else if (Array.isArray(value)) {
          safeHeaders[key] = sensitiveHeaders.includes(key.toLowerCase()) ? '[REDACTED]' : value.join(', ');
        }
      }
    }

    return safeHeaders;
  }

  /**
   * Gets the current server status
   */
  getStatus(): {
    listening: boolean;
    port: number;
    host: string;
    activeSessions: number;
  } {
    return {
      listening: this.httpServer.listening,
      port: this.port,
      host: this.host,
      activeSessions: this.sessionManager.getSessionCount(),
    };
  }
}

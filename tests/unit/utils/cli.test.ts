import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseCLIArgs, validateCLIConfig, DEFAULT_CLI_CONFIG, type CLIConfig } from '../../../src/utils/cli.js';

describe('parseCLIArgs', () => {
  const origArgv = process.argv;
  const origAuthToken = process.env.MCP_AUTH_TOKEN;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env.MCP_AUTH_TOKEN;
    delete process.env.MCP_PORT;
    delete process.env.MCP_HOST;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`EXIT:${code}`);
    }) as never);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.argv = origArgv;
    if (origAuthToken === undefined) delete process.env.MCP_AUTH_TOKEN;
    else process.env.MCP_AUTH_TOKEN = origAuthToken;
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('errors and exits nonzero on an unrecognized flag', () => {
    process.argv = ['node', 'dist/index.js', '--auth-token', 'secret'];
    expect(() => parseCLIArgs()).toThrow('EXIT:1');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: omnifocus-mcp-cached'));
  });

  it('does not misfire the default case on a value consumed by --port/--host', () => {
    process.argv = ['node', 'dist/index.js', '--port', '3111', '--host', '127.0.0.1'];
    const config = parseCLIArgs();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(config.port).toBe(3111);
    expect(config.host).toBe('127.0.0.1');
  });

  it('accepts --http alongside a valid --port/--host pair without exiting', () => {
    process.argv = ['node', 'dist/index.js', '--http', '--port', '4000'];
    const config = parseCLIArgs();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(config.httpMode).toBe(true);
    expect(config.port).toBe(4000);
  });

  it('still exits 0 for --help (unchanged behavior)', () => {
    process.argv = ['node', 'dist/index.js', '--help'];
    expect(() => parseCLIArgs()).toThrow('EXIT:0');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

describe('validateCLIConfig — --http without MCP_AUTH_TOKEN', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('warns loudly on stderr when httpMode is set and authToken is absent', () => {
    const config: CLIConfig = { ...DEFAULT_CLI_CONFIG, httpMode: true, authToken: undefined };
    validateCLIConfig(config);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('NO authentication'));
  });

  it('does not warn when authToken is present', () => {
    const config: CLIConfig = { ...DEFAULT_CLI_CONFIG, httpMode: true, authToken: 'set-token' };
    validateCLIConfig(config);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn in stdio mode regardless of authToken', () => {
    const config: CLIConfig = { ...DEFAULT_CLI_CONFIG, httpMode: false, authToken: undefined };
    validateCLIConfig(config);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

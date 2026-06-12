/* eslint-disable sonarjs/no-clear-text-protocols -- fixtures: host classification is ABOUT
   parsing http:// URLs; nothing here makes a network request */
import { describe, it, expect } from 'vitest';
import { isLocalhostOllamaHost, resolveNumCtx, DEFAULT_NUM_CTX } from '../../../scripts/lib/ollama-lifecycle.js';

// OMN-163: the probe may spawn `ollama serve` ONLY for a localhost target —
// never manage a remote server. Host classification is the safety boundary.
describe('isLocalhostOllamaHost', () => {
  it.each([
    'http://localhost:11434',
    'https://localhost:11434',
    'http://127.0.0.1:11434',
    'http://[::1]:11434',
    'http://localhost:11434/',
    // OLLAMA_HOST also accepts scheme-less host:port (ollama-js normalizes it)
    'localhost:11434',
    '127.0.0.1:11434',
    '127.0.0.1',
    'localhost',
    // 0.0.0.0 as a client target resolves to this machine
    'http://0.0.0.0:11434',
  ])('classifies %s as localhost', (host) => {
    expect(isLocalhostOllamaHost(host)).toBe(true);
  });

  it.each([
    'http://192.168.1.10:11434',
    'http://winbox.tailnet.ts.net:11434', // OMN-39 Tailscale topology — remote
    'http://ollama.example.com',
    'example.com:11434',
    // looks-like-localhost tricks must not pass
    'http://localhost.example.com:11434',
    'http://127.0.0.1.example.com:11434',
  ])('classifies %s as remote', (host) => {
    expect(isLocalhostOllamaHost(host)).toBe(false);
  });

  it('rejects unparseable hosts as non-localhost (fail closed)', () => {
    expect(isLocalhostOllamaHost('http://[malformed')).toBe(false);
    expect(isLocalhostOllamaHost('')).toBe(false);
  });
});

// OMN-163: num_ctx default measured 2026-06-12 — see scripts/lib/ollama-lifecycle.ts
// for the sizing rationale. Override via PROBE_NUM_CTX.
describe('resolveNumCtx', () => {
  it('defaults to the documented measured value when unset', () => {
    expect(resolveNumCtx(undefined)).toBe(DEFAULT_NUM_CTX);
    expect(DEFAULT_NUM_CTX).toBe(16384);
  });

  it('accepts a positive integer override', () => {
    expect(resolveNumCtx('8192')).toBe(8192);
    expect(resolveNumCtx(' 32768 ')).toBe(32768);
  });

  it.each(['abc', '0', '-5', '1.5', '16k', ''])('throws a clear error on %j', (raw) => {
    expect(() => resolveNumCtx(raw)).toThrow(/PROBE_NUM_CTX/);
  });
});

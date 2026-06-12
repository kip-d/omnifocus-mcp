/**
 * Ollama lifecycle helpers for the conformance probe (OMN-163).
 *
 * Pure decision logic lives here so it is unit-testable; the probe script owns
 * the process spawning/teardown that consumes these answers.
 */

import { URL } from 'node:url';

const LOCALHOST_NAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/**
 * May the probe spawn `ollama serve` for this OLLAMA_HOST target?
 *
 * Localhost only — the probe never manages a remote server (e.g. the OMN-39
 * Tailscale topology). Accepts both full URLs and the scheme-less host[:port]
 * forms OLLAMA_HOST allows. Unparseable input fails closed (treated as remote).
 */
export function isLocalhostOllamaHost(host: string): boolean {
  if (!host.trim()) return false;
  const withScheme = host.includes('://') ? host : `http://${host}`;
  try {
    return LOCALHOST_NAMES.has(new URL(withScheme).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Default context window for the probe's chat requests, measured 2026-06-12
 * (exact, via prompt_eval_count through each baseline model's own tokenizer):
 *
 *   - request side (system prompt + all 4 advertised tool schemas + case
 *     prompt): ~4,350 tokens — today's single-turn probe needs nothing more,
 *     so 16384 is ~3.7x headroom over actual use
 *   - worst-case future multi-turn round-trip: request + the largest response
 *     the server can return (limit:200 is truncated server-side to 100 rows,
 *     ~36KB ≈ 9,900 tokens) = ~14,300 tokens — still fits
 *   - RAM (llama3.1:8b resident): 16k → 7.9 GB vs 21 GB at the model's 131k
 *     default (Ollama ≥0.24 sizes the KV cache to num_ctx); 32k would cost
 *     11 GB to buy headroom for a multi-turn probe that does not exist yet
 *
 * Override via PROBE_NUM_CTX for experiments with larger payloads.
 */
export const DEFAULT_NUM_CTX = 16384;

/** Resolve num_ctx from a PROBE_NUM_CTX-style env value; throws on garbage. */
export function resolveNumCtx(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_NUM_CTX;
  const trimmed = raw.trim();
  const value = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`PROBE_NUM_CTX must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return value;
}

import { z } from 'zod';

export type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ]),
);

export type JxaResultOk<T extends JsonValue = JsonValue> = { ok: true; data: T; v: string };
export type JxaResultErr = { ok: false; error: { code?: string; message: string; details?: JsonValue }; v: string };
export type JxaEnvelope<T extends JsonValue = JsonValue> = JxaResultOk<T> | JxaResultErr;

export const JxaEnvelopeSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: JsonValueSchema, v: z.string() }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: z.string().optional(), message: z.string(), details: JsonValueSchema.optional() }),
    v: z.string(),
  }),
]);

export function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  return new Error(typeof e === 'string' ? e : safeStringify(e));
}

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? String(v) : v));
  } catch {
    return '[unserializable]';
  }
}

export function safeLog(message: string, data?: unknown, logger: { info: (...args: any[]) => void } = console) {
  if (data === undefined) {
    logger.info(message);
    return;
  }
  logger.info(message, safeStringify(data));
}


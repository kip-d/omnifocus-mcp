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

export function isEnvelope(value: unknown): value is JxaEnvelope {
  const res = JxaEnvelopeSchema.safeParse(value);
  return res.success;
}

type LegacyErrorShape = { error: true; message?: unknown; details?: unknown };

function isLegacyErrorShape(val: unknown): val is LegacyErrorShape {
  return !!val && typeof val === 'object' && Object.prototype.hasOwnProperty.call(val, 'error') && (val as Record<string, unknown>).error === true;
}

export function normalizeToEnvelope(value: unknown): JxaEnvelope<JsonValue> {
  // Already an envelope
  const parsed = JxaEnvelopeSchema.safeParse(value);
  if (parsed.success) return parsed.data as JxaEnvelope<JsonValue>;

  // Legacy error shape: { error: true, message, details? }
  if (isLegacyErrorShape(value)) {
    const v = 'legacy-1';
    const obj = value as Record<string, unknown>;
    const message = typeof obj.message === 'string' ? obj.message : 'JXA error';
    const rawDetails = Object.prototype.hasOwnProperty.call(obj, 'details') ? (obj.details as unknown) : undefined;
    let details: JsonValue | undefined;
    try {
      details = rawDetails === undefined ? undefined : (JSON.parse(JSON.stringify(rawDetails)) as JsonValue);
    } catch {
      details = undefined;
    }
    return { ok: false, error: { message, details }, v };
  }

  // Legacy success: arbitrary JSON payload
  return { ok: true, data: (value ?? null) as JsonValue, v: 'legacy-1' };
}

export function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  return new Error(typeof e === 'string' ? e : safeStringify(e));
}

export function safeStringify(value: unknown): string {
  try {
    // JSON.stringify replacer function handles unknown values safely
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? String(v) : v));
  } catch {
    return '[unserializable]';
  }
}

type MinimalLogger = { info: (...args: unknown[]) => void };

export function safeLog(message: string, data?: unknown, logger: MinimalLogger = console) {
  if (data === undefined) {
    logger.info(message);
    return;
  }
  logger.info(message, safeStringify(data));
}

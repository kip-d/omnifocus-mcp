import { z } from 'zod';

export type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(JsonValueSchema)]),
);

export type JxaResultOk<T extends JsonValue = JsonValue> = { ok: true; data: T; v: string };
export type JxaResultErr = { ok: false; error: { code?: string; message: string; details?: JsonValue }; v: string };
export type JxaEnvelope<T extends JsonValue = JsonValue> = JxaResultOk<T> | JxaResultErr;

// Superseded at runtime by detectKnownErrorShape's hand-rolled superset check (also catches
// malformed {ok:false} envelopes this schema would reject); retained as the envelope contract's
// type-level reference; no code dependency — ts-prune WILL flag it; expected, do not delete (spec §3.6).
export const JxaEnvelopeSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: JsonValueSchema, v: z.string() }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: z.string().optional(), message: z.string(), details: JsonValueSchema.optional() }),
    v: z.string(),
  }),
]);

export function safeStringify(value: unknown): string {
  try {
    // JSON.stringify replacer function handles unknown values safely
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? String(v) : v));
  } catch {
    return '[unserializable]';
  }
}

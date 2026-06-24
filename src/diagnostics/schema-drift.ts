import { z } from 'zod';

export interface CanonicalField {
  type: string;
  required: boolean;
  enum?: (string | number)[];
  coercible?: boolean; // only meaningful for the Zod side
}
export type CanonicalSchema = Record<string, CanonicalField>;

type JsonSchemaNode = {
  type?: string;
  enum?: (string | number)[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
};

/**
 * Canonicalize the advertised JSON schema.
 * @param wrapperKey  For read/write/analyze the real fields are nested one level under a single
 *                     wrapper property ('query' | 'mutation' | 'analysis'). Pass it to descend.
 *                     Omit for flat schemas (the `system` tool).
 */
export function canonicalizeInputSchema(advertised: Record<string, unknown>, wrapperKey?: string): CanonicalSchema {
  let node = advertised as JsonSchemaNode;
  if (wrapperKey) {
    const wrapped = node.properties?.[wrapperKey];
    if (!wrapped)
      throw new Error(`canonicalizeInputSchema: wrapper key '${wrapperKey}' not found in advertised schema`);
    node = wrapped;
  }
  const props = node.properties ?? {};
  const required = new Set(node.required ?? []);
  const out: CanonicalSchema = {};
  for (const [name, def] of Object.entries(props)) {
    out[name] = { type: def.type ?? 'unknown', required: required.has(name), enum: def.enum };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Zod private-API access (`_def`). Zod does NOT expose a stable public reflection
// API, so canonicalizing a Zod schema means walking `_def`. The `typeName` string
// constants below ('ZodEffects', 'ZodOptional', 'ZodDiscriminatedUnion', etc.) are
// stable across all of Zod 3.x (this package pins `^3.25.76`), but a Zod 4 upgrade
// WILL rename/restructure `_def` and these mappings must be re-derived against the
// new internals. DIAGNOSIS BREADCRUMB: if `canonicalizeZodSchema` starts returning
// `{}` for real tool schemas (the CI drift gate's non-vacuity assertion will fire
// first), start here — `unwrap`/`fieldType`/`membersOf` `typeName` strings are the
// first thing to re-check after any Zod version bump.
// ---------------------------------------------------------------------------
type ZDef = {
  typeName?: string;
  schema?: z.ZodTypeAny; // ZodEffects (z.preprocess / z.transform)
  innerType?: z.ZodTypeAny; // ZodOptional / ZodDefault / ZodNullable
  values?: unknown[]; // ZodEnum
  value?: unknown; // ZodLiteral
  discriminator?: string; // ZodDiscriminatedUnion
  options?: Map<unknown, z.ZodTypeAny> | z.ZodTypeAny[]; // ZodDiscriminatedUnion members
};
const defOf = (s: z.ZodTypeAny): ZDef => (s as unknown as { _def: ZDef })._def;

/** Peel ZodEffects (preprocess/transform — this is what coerceObject is), Optional, Default, Nullable. */
function unwrap(s: z.ZodTypeAny): z.ZodTypeAny {
  let cur = s;
  for (;;) {
    const d = defOf(cur);
    if (d.typeName === 'ZodEffects' && d.schema) cur = d.schema;
    else if (
      (d.typeName === 'ZodOptional' || d.typeName === 'ZodDefault' || d.typeName === 'ZodNullable') &&
      d.innerType
    )
      cur = d.innerType;
    else return cur;
  }
}

function isCoercibleNumber(field: z.ZodTypeAny): boolean {
  // Behavioral probe — NEVER pattern-match source. A number field is "coercible" iff a stringified
  // number survives validation. Catches z.coerce.number(), z.preprocess(...), z.union([...]) alike.
  return field.safeParse('5').success;
}

function fieldType(field: z.ZodTypeAny): { type: string; enum?: (string | number)[] } {
  const inner = unwrap(field);
  const d = defOf(inner);
  if (d.typeName === 'ZodEnum') return { type: 'string', enum: d.values as (string | number)[] };
  if (d.typeName === 'ZodLiteral')
    return { type: typeof d.value === 'number' ? 'number' : 'string', enum: [d.value as string | number] };
  if (d.typeName === 'ZodNumber') return { type: 'number' };
  if (d.typeName === 'ZodBoolean') return { type: 'boolean' };
  if (d.typeName === 'ZodString') return { type: 'string' };
  return { type: 'object' };
}

function membersOf(du: z.ZodTypeAny): z.ZodTypeAny[] {
  const opts = defOf(du).options;
  if (!opts) return [];
  return Array.isArray(opts) ? opts : [...opts.values()];
}

/** Merge object/discriminated-union members into one CanonicalSchema.
 *  required(field) := present AND required in EVERY member (absence in any member ⇒ not required).
 *  enum/coercible := unioned across members (discriminator literal values collapse to one enum). */
function mergeShapes(members: z.ZodTypeAny[]): CanonicalSchema {
  const out: CanonicalSchema = {};
  const presentCount: Record<string, number> = {};
  for (const m of members) {
    const shape = (unwrap(m) as z.ZodObject<z.ZodRawShape>).shape ?? {};
    for (const [name, raw] of Object.entries(shape)) {
      const field = raw as z.ZodTypeAny;
      presentCount[name] = (presentCount[name] ?? 0) + 1;
      const required = !(field.isOptional?.() ?? false);
      const probe = isCoercibleNumber(field);
      const { type, enum: en } = fieldType(field);
      const prev = out[name];
      const mergedEnum = [...new Set([...(prev?.enum ?? []), ...(en ?? [])])];
      out[name] = {
        type: prev?.type ?? type,
        required: prev ? prev.required && required : required,
        enum: mergedEnum.length ? mergedEnum : undefined,
        coercible: (prev?.coercible ?? false) || probe,
      };
    }
  }
  // A field absent from any member cannot be globally required.
  for (const [name, f] of Object.entries(out)) {
    if (presentCount[name] !== members.length) f.required = false;
  }
  return out;
}

/**
 * Canonicalize a tool's Zod schema.
 * @param wrapperKey  read/write/analyze wrap the real schema under one key
 *                     ('query'|'mutation'|'analysis') via coerceObject (= z.preprocess) over a
 *                     z.discriminatedUnion. Pass it to descend. Omit for the flat `system` schema.
 */
export function canonicalizeZodSchema(schema: z.ZodTypeAny, wrapperKey?: string): CanonicalSchema {
  const top = unwrap(schema) as z.ZodObject<z.ZodRawShape>;
  let target: z.ZodTypeAny = top;
  if (wrapperKey) {
    const wrapped = top.shape?.[wrapperKey];
    if (!wrapped) throw new Error(`canonicalizeZodSchema: wrapper key '${wrapperKey}' not found`);
    target = unwrap(wrapped); // peels coerceObject's z.preprocess → inner discriminatedUnion/object
  }
  const td = defOf(target);
  if (td.typeName === 'ZodDiscriminatedUnion' || td.typeName === 'ZodUnion') {
    return mergeShapes(membersOf(target));
  }
  // Plain object (system tool, or a non-union wrapper).
  return mergeShapes([target]);
}

export type DriftKind = 'FIELD_MISSING' | 'ENUM_MISMATCH' | 'REQUIRED_MISMATCH' | 'COERCION_GAP';
export interface DriftFinding {
  kind: DriftKind;
  field: string;
  detail: string;
}

export function diffSchemas(advertised: CanonicalSchema, zod: CanonicalSchema): DriftFinding[] {
  const findings: DriftFinding[] = [];
  const fields = new Set([...Object.keys(advertised), ...Object.keys(zod)]);
  for (const f of fields) {
    const a = advertised[f];
    const zf = zod[f];
    if (a && !zf) {
      findings.push({ kind: 'FIELD_MISSING', field: f, detail: 'advertised to LLM but not validated by Zod' });
      continue;
    }
    if (!a && zf) {
      findings.push({ kind: 'FIELD_MISSING', field: f, detail: 'validated by Zod but never advertised to LLM' });
      continue;
    }
    if (!a || !zf) continue;
    // Sort both with the same string-coercing comparator so equal sets stringify equally
    // regardless of order (enum values are string | number); the comparison detects set mismatch.
    const byString = (x: string | number, y: string | number): number => String(x).localeCompare(String(y));
    if (
      a.enum &&
      zf.enum &&
      JSON.stringify([...a.enum].sort(byString)) !== JSON.stringify([...zf.enum].sort(byString))
    ) {
      findings.push({
        kind: 'ENUM_MISMATCH',
        field: f,
        detail: `advertised [${a.enum.join(', ')}] vs validated [${zf.enum.join(', ')}]`,
      });
    }
    if (a.required !== zf.required) {
      findings.push({
        kind: 'REQUIRED_MISMATCH',
        field: f,
        detail: `advertised required=${a.required} vs validated required=${zf.required}`,
      });
    }
    if (a.type === 'number' && zf.coercible === false) {
      findings.push({
        kind: 'COERCION_GAP',
        field: f,
        detail: 'advertised numeric but Zod rejects stringified input (Claude Desktop stringifies all params)',
      });
    }
  }
  return findings;
}

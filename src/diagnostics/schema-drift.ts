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

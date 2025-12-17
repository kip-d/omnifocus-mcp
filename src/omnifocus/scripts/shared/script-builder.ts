/**
 * Centralized script builder that ensures all parameters are properly declared
 * This prevents "Can't find variable" errors by automatically injecting parameter declarations
 */

export interface ScriptParameters {
  [key: string]: unknown;
}

/**
 * Build a parameter declaration block for a script
 * @param params Object containing all parameters to inject
 * @returns JavaScript code that declares all parameters as const variables
 */
export function buildParameterDeclarations(params: ScriptParameters): string {
  const declarations: string[] = [];

  // Sort keys for consistent output
  const sortedKeys = Object.keys(params).sort();

  for (const key of sortedKeys) {
    // Each parameter gets its own const declaration
    // This ensures the parameter exists even if the placeholder isn't replaced
    declarations.push(`const ${key} = {{${key}}};`);
  }

  return declarations.join('\n  ');
}

/**
 * Wrap a script with proper parameter declarations and error handling
 * @param scriptBody The main script logic
 * @param params Parameters that will be injected
 * @returns Complete script with parameter declarations
 */
export function buildScriptWithParameters(scriptBody: string, params: ScriptParameters): string {
  const paramDeclarations = buildParameterDeclarations(params);

  return `(() => {
  // Automatically injected parameter declarations
  ${paramDeclarations}
  
  // Script body
  ${scriptBody}
})();`;
}

/**
 * Extract expected parameters from a script template
 * Looks for {{paramName}} placeholders
 * @param template Script template with placeholders
 * @returns Array of parameter names found in the template
 */
export function extractExpectedParameters(template: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const params = new Set<string>();

  let match;
  while ((match = regex.exec(template)) !== null) {
    params.add(match[1]);
  }

  return Array.from(params).sort();
}

/**
 * Validate that all expected parameters are provided
 * @param template Script template
 * @param providedParams Parameters being passed to the script
 * @returns Object with validation result and any missing parameters
 */
export function validateScriptParameters(
  template: string,
  providedParams: ScriptParameters,
): { valid: boolean; missing: string[]; extra: string[] } {
  const expected = extractExpectedParameters(template);
  const provided = Object.keys(providedParams);

  const missing = expected.filter((param) => !provided.includes(param));
  const extra = provided.filter((param) => !expected.includes(param));

  return {
    valid: missing.length === 0,
    missing,
    extra,
  };
}

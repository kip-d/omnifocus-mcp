/**
 * Base class for building OmniFocus JXA scripts
 */
export class ScriptBuilder {
  protected parts: string[] = [];
  protected helpers: Set<string> = new Set();

  /**
   * Add helper functions to the script
   */
  addHelpers(...helperNames: string[]): this {
    helperNames.forEach(name => this.helpers.add(name));
    return this;
  }

  /**
   * Add a raw script part
   */
  addRaw(script: string): this {
    this.parts.push(script);
    return this;
  }

  /**
   * Add the main script body
   */
  addMain(script: string): this {
    this.parts.push(script);
    return this;
  }

  /**
   * Wrap the script in a try-catch block
   */
  wrapInTryCatch(operationName: string): this {
    const current = this.parts.join('\n');
    this.parts = [
      'try {',
      current,
      '} catch (error) {',
      `  return formatError(error, '${operationName}');`,
      '}',
    ];
    return this;
  }

  /**
   * Build the final script
   */
  build(): string {
    // Import helpers at the beginning
    const helperImports = Array.from(this.helpers).map(name => {
      return `// Helper: ${name}`;
    }).join('\n');

    return [
      helperImports,
      ...this.parts,
    ].filter(Boolean).join('\n');
  }
}

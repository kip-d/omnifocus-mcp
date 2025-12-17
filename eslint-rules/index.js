/**
 * Custom ESLint rules for OmniFocus MCP coding standards
 */

module.exports = {
  rules: {
    /**
     * Ensure all Tool classes extend BaseTool
     */
    'extend-base-tool': {
      create(context) {
        return {
          ClassDeclaration(node) {
            if (node.id && node.id.name.endsWith('Tool')) {
              if (!node.superClass || node.superClass.name !== 'BaseTool') {
                context.report({
                  node,
                  message: 'Tool classes must extend BaseTool',
                });
              }
            }
          },
        };
      },
    },

    /**
     * Ensure tools use standardized response functions
     */
    'use-standard-response': {
      create(context) {
        return {
          ReturnStatement(node) {
            // Check if we're in a tool file
            const filename = context.getFilename();
            if (!filename.includes('/tools/') || !filename.endsWith('Tool.ts')) {
              return;
            }

            // Check if returning an object literal directly
            if (node.argument && node.argument.type === 'ObjectExpression') {
              const properties = node.argument.properties.map((p) => p.key?.name);

              // If it looks like a response object but not using standard functions
              if (properties.includes('success') || properties.includes('data')) {
                context.report({
                  node,
                  message:
                    'Use createSuccessResponse, createErrorResponse, or createListResponse instead of returning plain objects',
                });
              }
            }
          },
        };
      },
    },

    /**
     * Ensure error handling uses this.handleError
     */
    'use-handle-error': {
      create(context) {
        return {
          CatchClause(node) {
            const filename = context.getFilename();
            if (!filename.includes('/tools/') || !filename.endsWith('Tool.ts')) {
              return;
            }

            // Check if catch block body contains this.handleError
            const sourceCode = context.getSourceCode();
            const catchBody = sourceCode.getText(node.body);

            if (!catchBody.includes('this.handleError')) {
              // Check if it's throwing (which is sometimes acceptable)
              if (!catchBody.includes('throw')) {
                context.report({
                  node,
                  message: 'Use this.handleError(error) in catch blocks for consistent error handling',
                });
              }
            }
          },
        };
      },
    },

    /**
     * Ensure metadata fields use snake_case
     */
    'metadata-snake-case': {
      create(context) {
        return {
          Property(node) {
            // Look for metadata object properties
            if (node.parent && node.parent.parent) {
              const parentNode = node.parent.parent;

              // Check if this is likely a metadata object
              if (parentNode.type === 'CallExpression') {
                const callee = parentNode.callee;
                if (
                  callee.name === 'createSuccessResponse' ||
                  callee.name === 'createErrorResponse' ||
                  callee.name === 'createListResponse'
                ) {
                  // Check if property is in the metadata parameter (3rd argument)
                  const args = parentNode.arguments;
                  if (args[2] && node.parent === args[2]) {
                    const key = node.key.name || node.key.value;

                    // Check if key is camelCase (should be snake_case)
                    if (key && /[a-z][A-Z]/.test(key)) {
                      context.report({
                        node,
                        message: `Metadata field '${key}' should use snake_case naming`,
                      });
                    }
                  }
                }
              }
            }
          },
        };
      },
    },

    /**
     * Ensure schema files export Zod schemas
     */
    'export-zod-schema': {
      create(context) {
        let hasZodImport = false;
        let hasSchemaExport = false;

        return {
          ImportDeclaration(node) {
            if (node.source.value === 'zod') {
              hasZodImport = true;
            }
          },
          ExportNamedDeclaration(node) {
            if (node.declaration && node.declaration.declarations) {
              node.declaration.declarations.forEach((decl) => {
                if (decl.id.name && decl.id.name.endsWith('Schema')) {
                  hasSchemaExport = true;
                }
              });
            }
          },
          'Program:exit'() {
            const filename = context.getFilename();
            if (filename.includes('/schemas/') && filename.endsWith('.ts')) {
              if (!hasZodImport) {
                context.report({
                  node: context.getSourceCode().ast,
                  message: 'Schema files must import from zod',
                });
              }
              if (!hasSchemaExport) {
                context.report({
                  node: context.getSourceCode().ast,
                  message: 'Schema files must export at least one Schema',
                });
              }
            }
          },
        };
      },
    },
  },
};

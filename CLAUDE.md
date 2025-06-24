## Development Notes

- **TypeScript First**: This is a TypeScript project. All new code should be written in TypeScript (.ts files)
- **No JavaScript Files**: Do not create .js files for new functionality - use TypeScript
- Before calling a project done, install the project and run integration tests (call the MCP server as Claude Desktop would do it)
- We are using Omnifocus 4.6+
- **Testing**: Use TypeScript for test files as well (e.g., .test.ts files)

## Debugging Learnings

### Technical Insights
- **MCP server failures** are often missing build artifacts rather than configuration issues - always check `dist/` directories exist before debugging protocol-level problems
- **MCP Inspector diagnostic tool** is the proper way to test servers, but build issues prevent it from even starting the server process

### Methodological Insights
- **Direct file system checks** (ls, file existence) are faster than running complex diagnostic tools when the root cause is missing compiled output
- **Build-first debugging** - run `npm run build` immediately when TypeScript MCP servers fail to load, before investigating logs or protocol issues
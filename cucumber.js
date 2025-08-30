module.exports = {
  default: {
    paths: ['tests/features/*.feature'],
    require: ['tests/features/step_definitions/*.ts', 'tests/features/support/*.ts'],
    requireModule: ['ts-node/register'],
    format: [
      'progress',
      'html:test-results/cucumber-report.html',
      'json:test-results/cucumber-report.json'
    ],
    formatOptions: {
      snippetInterface: 'async-await'
    },
    publishQuiet: true,
    parallel: 1, // Run sequentially to avoid OmniFocus conflicts
    tags: 'not @manual' // Skip manual-only tests by default
  },
  testData: {
    paths: ['tests/features/test-data-management.feature'],
    require: ['tests/features/step_definitions/*.ts', 'tests/features/support/*.ts'],
    requireModule: ['ts-node/register'],
    format: ['progress'],
    formatOptions: {
      snippetInterface: 'async-await'
    },
    publishQuiet: true,
    tags: '@test-data' // Only run test data management scenarios
  }
};

export default {
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
    publishQuiet: true
  }
};
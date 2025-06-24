export default {
  default: {
    paths: ['test/features/*.feature'],
    import: ['test/features/step_definitions/*.js', 'test/features/support/*.js'],
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
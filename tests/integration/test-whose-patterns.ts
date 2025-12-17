import { OmniAutomation } from '../../dist/omnifocus/OmniAutomation.js';

const omni = new OmniAutomation();

const testScript = `
  try {
    const results = {};
    
    // Test 1: How does flattenedTasks.whose() work?
    try {
      // First get the flattenedTasks property accessor
      const flattenedTasksAccessor = doc.flattenedTasks;
      results.accessor = {
        type: typeof flattenedTasksAccessor,
        toString: Object.prototype.toString.call(flattenedTasksAccessor),
        hasWhose: typeof flattenedTasksAccessor.whose === 'function'
      };
      
      // Now test whose() return value
      if (flattenedTasksAccessor.whose) {
        const whoseResult = flattenedTasksAccessor.whose({completed: false});
        results.whoseReturn = {
          type: typeof whoseResult,
          toString: Object.prototype.toString.call(whoseResult),
          isCallable: typeof whoseResult === 'function',
          hasLength: 'length' in whoseResult
        };
        
        // Try to get actual tasks
        if (typeof whoseResult === 'function') {
          const tasks = whoseResult();
          results.finalTasks = {
            type: typeof tasks,
            isArray: Array.isArray(tasks),
            count: tasks.length,
            firstTask: tasks.length > 0 ? tasks[0].name() : null
          };
        }
      }
    } catch (e) {
      results.error = e.toString();
    }
    
    // Test 2: Working date comparisons
    const dateTests = {};
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24*60*60*1000);
    const tomorrow = new Date(now.getTime() + 24*60*60*1000);
    
    // Test different date comparison syntaxes
    const dateComparisons = [
      { name: 'greater_than_date', query: {dueDate: {'>': now}} },
      { name: 'less_than_date', query: {dueDate: {'<': now}} },
      { name: 'equals_date', query: {dueDate: now} },
      { name: 'greater_equal', query: {dueDate: {'>=': now}} },
      { name: 'less_equal', query: {dueDate: {'<=': now}} },
      { name: 'between_dates', query: {_and: [{dueDate: {'>': yesterday}}, {dueDate: {'<': tomorrow}}]} }
    ];
    
    for (const test of dateComparisons) {
      try {
        const tasks = doc.flattenedTasks.whose(test.query)();
        dateTests[test.name] = {
          success: true,
          count: tasks.length
        };
      } catch (e) {
        dateTests[test.name] = {
          success: false,
          error: e.message || e.toString()
        };
      }
    }
    
    // Test 3: String comparisons that work
    const stringTests = {};
    const stringComparisons = [
      { name: 'exact_match', query: {name: 'Email Migration to MCE'} },
      { name: 'beginsWith', query: {name: {'beginsWith': 'Email'}} },
      { name: 'endsWith', query: {name: {'endsWith': 'MCE'}} },
      { name: 'contains', query: {name: {'contains': 'Migration'}} },
      { name: 'matches_regex', query: {name: {'matches': '.*[Ee]mail.*'}} }
    ];
    
    for (const test of stringComparisons) {
      try {
        const tasks = doc.flattenedTasks.whose(test.query)();
        stringTests[test.name] = {
          success: true,
          count: tasks.length,
          sample: tasks.length > 0 ? tasks[0].name() : null
        };
      } catch (e) {
        stringTests[test.name] = {
          success: false,
          error: e.message || e.toString()
        };
      }
    }
    
    return JSON.stringify({
      success: true,
      results: results,
      dateTests: dateTests,
      stringTests: stringTests
    }, null, 2);
  } catch (e) {
    return JSON.stringify({
      success: false,
      error: e.toString(),
      stack: e.stack || 'No stack trace'
    });
  }
`;

async function testWhosePatterns() {
  console.log('Testing whose() implementation patterns...\n');

  try {
    const result = await omni.execute(testScript);
    console.log('Results:', JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

testWhosePatterns().catch(console.error);

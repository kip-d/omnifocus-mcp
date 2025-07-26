import { OmniAutomation } from '../../dist/omnifocus/OmniAutomation.js';

const omni = new OmniAutomation();

const edgeCaseScript = `
  const results = {
    tests: []
  };
  
  // Helper to safely test a whose() query
  function testWhose(name, query) {
    const test = { name: name, query: JSON.stringify(query) };
    try {
      const startTime = Date.now();
      const tasks = doc.flattenedTasks.whose(query)();
      const elapsed = Date.now() - startTime;
      
      test.success = true;
      test.count = tasks.length;
      test.elapsed_ms = elapsed;
      test.sample = tasks.length > 0 ? tasks[0].name() : null;
    } catch (e) {
      test.success = false;
      test.error = e.message || e.toString();
    }
    results.tests.push(test);
  }
  
  // Test 1: Check property types
  const sampleTask = doc.flattenedTasks()[0];
  results.propertyTypes = {
    name: typeof sampleTask.name(),
    completed: typeof sampleTask.completed(),
    flagged: typeof sampleTask.flagged(),
    dueDate: typeof sampleTask.dueDate(),
    dueDate_value: sampleTask.dueDate() ? Object.prototype.toString.call(sampleTask.dueDate()) : 'null'
  };
  
  // Test various whose() queries
  testWhose('empty object', {});
  testWhose('non-existent property', {foobar: true});
  testWhose('id match', {id: sampleTask.id()});
  
  // Test different null/undefined patterns
  testWhose('null with _equals', {dueDate: {'_equals': null}});
  testWhose('undefined comparison', {dueDate: undefined});
  testWhose('_not with null', {dueDate: {'_not': null}});
  
  // Test nested properties
  testWhose('project.name', {'project.name': 'Inbox'});
  
  // Test case sensitivity
  testWhose('case sensitive name', {name: sampleTask.name()});
  testWhose('different case name', {name: sampleTask.name().toUpperCase()});
  
  // Performance test: measure overhead of whose() vs manual filter
  const perfTest = {};
  
  // Whose method
  const whoseStart = Date.now();
  const whoseTasks = doc.flattenedTasks.whose({completed: false})();
  perfTest.whose_ms = Date.now() - whoseStart;
  perfTest.whose_count = whoseTasks.length;
  
  // Manual method
  const manualStart = Date.now();
  const allTasks = doc.flattenedTasks();
  const manualTasks = [];
  for (let i = 0; i < allTasks.length; i++) {
    if (!allTasks[i].completed()) {
      manualTasks.push(allTasks[i]);
    }
  }
  perfTest.manual_ms = Date.now() - manualStart;
  perfTest.manual_count = manualTasks.length;
  perfTest.speedup_factor = (perfTest.manual_ms / perfTest.whose_ms).toFixed(2);
  
  results.performance = perfTest;
  
  return JSON.stringify(results, null, 2);
`;

async function testEdgeCases() {
  console.log('Testing whose() edge cases and performance...\n');
  
  try {
    const result = await omni.execute<any>(edgeCaseScript);
    
    if (result) {
      console.log('Property Types:');
      console.log(result.propertyTypes);
      
      console.log('\nTest Results:');
      console.log('='.repeat(80));
      
      for (const test of result.tests) {
        console.log(`\nTest: ${test.name}`);
        console.log(`Query: ${test.query}`);
        console.log(`Success: ${test.success ? '✅' : '❌'}`);
        
        if (test.success) {
          console.log(`Count: ${test.count}`);
          console.log(`Time: ${test.elapsed_ms}ms`);
          if (test.sample) console.log(`Sample: ${test.sample}`);
        } else {
          console.log(`Error: ${test.error}`);
        }
      }
      
      console.log('\n' + '='.repeat(80));
      console.log('\nPerformance Comparison:');
      console.log(`whose() method: ${result.performance.whose_ms}ms for ${result.performance.whose_count} tasks`);
      console.log(`Manual filter: ${result.performance.manual_ms}ms for ${result.performance.manual_count} tasks`);
      console.log(`Speedup factor: ${result.performance.speedup_factor}x`);
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

testEdgeCases().catch(console.error);
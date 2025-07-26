import { OmniAutomation } from '../../dist/omnifocus/OmniAutomation.js';

const omni = new OmniAutomation();

const testScript = `
  const results = {
    operators: []
  };
  
  // Helper to test an operator
  function testOperator(name, query, description) {
    const test = { 
      name, 
      query: JSON.stringify(query),
      description 
    };
    
    try {
      const startTime = Date.now();
      const tasks = doc.flattenedTasks.whose(query)();
      test.success = true;
      test.count = tasks.length;
      test.time_ms = Date.now() - startTime;
      test.sample = tasks.length > 0 ? tasks[0].name() : null;
    } catch (e) {
      test.success = false;
      test.error = e.message || e.toString();
    }
    
    results.operators.push(test);
  }
  
  // Test equality operators
  testOperator('equals', 
    {name: "Test task"}, 
    'Direct equality');
    
  testOperator('not_equals', 
    {name: {_not: "Test task"}}, 
    'Not equal to specific value');
  
  // Test string operators
  testOperator('contains', 
    {name: {_contains: "email"}}, 
    'String contains');
    
  testOperator('beginsWith', 
    {name: {_beginsWith: "Email"}}, 
    'String begins with');
    
  testOperator('endsWith', 
    {name: {_endsWith: "MCE"}}, 
    'String ends with');
  
  // Test with different case
  testOperator('contains_case', 
    {name: {_contains: "EMAIL"}}, 
    'Contains with different case');
  
  // Test date comparison operators
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24*60*60*1000);
  const tomorrow = new Date(today.getTime() + 24*60*60*1000);
  
  testOperator('date_gt', 
    {dueDate: {_gt: yesterday}}, 
    'Date greater than yesterday');
    
  testOperator('date_lt', 
    {dueDate: {_lt: tomorrow}}, 
    'Date less than tomorrow');
    
  // Test the old syntax for comparison
  testOperator('date_gt_old', 
    {dueDate: {'>': yesterday}}, 
    'Date > with old syntax');
    
  testOperator('date_lt_old', 
    {dueDate: {'<': tomorrow}}, 
    'Date < with old syntax');
  
  // Test combined operators
  testOperator('combined_and', 
    {_and: [
      {completed: false},
      {name: {_contains: "email"}}
    ]}, 
    'AND with contains');
    
  testOperator('combined_or', 
    {_or: [
      {name: {_beginsWith: "Email"}},
      {name: {_beginsWith: "Set up"}}
    ]}, 
    'OR with beginsWith');
  
  // Test number comparisons (estimatedMinutes)
  testOperator('number_gt', 
    {estimatedMinutes: {_gt: 30}}, 
    'Estimated minutes > 30');
    
  testOperator('number_lt', 
    {estimatedMinutes: {_lt: 60}}, 
    'Estimated minutes < 60');
  
  // Test the problematic ones
  testOperator('not_null_attempt', 
    {dueDate: {_not: null}}, 
    'Not null (likely to fail)');
    
  testOperator('null_check', 
    {dueDate: null}, 
    'Direct null check');
  
  // Test matches (regex)
  testOperator('matches_regex', 
    {name: {_matches: ".*[Ee]mail.*"}}, 
    'Regex match');
  
  return JSON.stringify(results, null, 2);
`;

async function testOperators() {
  console.log('Testing JXA whose() operators with correct syntax...\n');
  
  try {
    const result = await omni.execute<any>(testScript);
    
    if (result && result.operators) {
      console.log('Test Results:');
      console.log('='.repeat(80));
      
      // Group by success/failure
      const successful = result.operators.filter((t: any) => t.success);
      const failed = result.operators.filter((t: any) => !t.success);
      
      console.log('\n✅ Successful Operators:');
      successful.forEach((test: any) => {
        console.log(`\n${test.name}: ${test.description}`);
        console.log(`Query: ${test.query}`);
        console.log(`Found: ${test.count} tasks in ${test.time_ms}ms`);
        if (test.sample) console.log(`Sample: "${test.sample}"`);
      });
      
      console.log('\n\n❌ Failed Operators:');
      failed.forEach((test: any) => {
        console.log(`\n${test.name}: ${test.description}`);
        console.log(`Query: ${test.query}`);
        console.log(`Error: ${test.error}`);
      });
      
      console.log('\n' + '='.repeat(80));
      console.log(`\nSummary: ${successful.length} successful, ${failed.length} failed`);
    }
  } catch (error: any) {
    console.error('Error executing test:', error.message);
  }
}

testOperators().catch(console.error);
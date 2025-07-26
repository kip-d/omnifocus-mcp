import { OmniAutomation } from '../../dist/omnifocus/OmniAutomation.js';

const omni = new OmniAutomation();

interface TestCase {
  name: string;
  script: string;
}

const testCases: TestCase[] = [
  {
    name: "Basic whose() with boolean property",
    script: `
      const tasks = doc.flattenedTasks.whose({completed: false})();
      return JSON.stringify({
        success: true,
        count: tasks.length,
        sample: tasks.length > 0 ? tasks[0].name() : null
      });
    `
  },
  {
    name: "whose() with multiple boolean properties",
    script: `
      const tasks = doc.flattenedTasks.whose({completed: false, flagged: true})();
      return JSON.stringify({
        success: true,
        count: tasks.length,
        sample: tasks.length > 0 ? tasks[0].name() : null
      });
    `
  },
  {
    name: "whose() with null comparison (!=)",
    script: `
      try {
        const tasks = doc.flattenedTasks.whose({dueDate: {'!=': null}})();
        return JSON.stringify({
          success: true,
          count: tasks.length,
          sample: tasks.length > 0 ? tasks[0].name() : null
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `
  },
  {
    name: "whose() with null comparison (direct)",
    script: `
      try {
        const tasks = doc.flattenedTasks.whose({dueDate: null})();
        return JSON.stringify({
          success: true,
          count: tasks.length,
          sample: tasks.length > 0 ? tasks[0].name() : null
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `
  },
  {
    name: "whose() with date comparison (>)",
    script: `
      try {
        const today = new Date();
        const tasks = doc.flattenedTasks.whose({dueDate: {'>': today}})();
        return JSON.stringify({
          success: true,
          count: tasks.length,
          sample: tasks.length > 0 ? tasks[0].name() : null
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `
  },
  {
    name: "whose() with string property",
    script: `
      try {
        const tasks = doc.flattenedTasks.whose({name: 'Test Task'})();
        return JSON.stringify({
          success: true,
          count: tasks.length,
          sample: tasks.length > 0 ? tasks[0].name() : null
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `
  },
  {
    name: "whose() with contains operator",
    script: `
      try {
        const tasks = doc.flattenedTasks.whose({name: {'contains': 'email'}})();
        return JSON.stringify({
          success: true,
          count: tasks.length,
          sample: tasks.length > 0 ? tasks[0].name() : null
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `
  },
  {
    name: "whose() _and operator",
    script: `
      try {
        const tasks = doc.flattenedTasks.whose({
          _and: [
            {completed: false},
            {flagged: true}
          ]
        })();
        return JSON.stringify({
          success: true,
          count: tasks.length,
          sample: tasks.length > 0 ? tasks[0].name() : null
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `
  },
  {
    name: "whose() _or operator",
    script: `
      try {
        const tasks = doc.flattenedTasks.whose({
          _or: [
            {flagged: true},
            {inInbox: true}
          ]
        })();
        return JSON.stringify({
          success: true,
          count: tasks.length,
          sample: tasks.length > 0 ? tasks[0].name() : null
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `
  },
  {
    name: "flattenedTasks as property vs method",
    script: `
      try {
        // Test if flattenedTasks is a property or method
        const isProperty = typeof doc.flattenedTasks === 'object';
        const isMethod = typeof doc.flattenedTasks === 'function';
        
        let propertyResult = null;
        let methodResult = null;
        
        if (isProperty) {
          try {
            const tasks = doc.flattenedTasks;
            propertyResult = {
              type: typeof tasks,
              hasWhose: typeof tasks.whose === 'function',
              count: tasks.length || 'no length property'
            };
          } catch (e) {
            propertyResult = { error: e.toString() };
          }
        }
        
        if (isMethod) {
          try {
            const tasks = doc.flattenedTasks();
            methodResult = {
              type: typeof tasks,
              isArray: Array.isArray(tasks),
              hasWhose: tasks && typeof tasks.whose === 'function',
              count: tasks ? tasks.length : 'null'
            };
          } catch (e) {
            methodResult = { error: e.toString() };
          }
        }
        
        return JSON.stringify({
          success: true,
          isProperty: isProperty,
          isMethod: isMethod,
          propertyResult: propertyResult,
          methodResult: methodResult
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `
  },
  {
    name: "Testing different whose() call patterns",
    script: `
      try {
        const results = {};
        
        // Pattern 1: whose({...})() - method call
        try {
          const t1 = doc.flattenedTasks.whose({completed: false})();
          results.pattern1 = { success: true, count: t1.length };
        } catch (e) {
          results.pattern1 = { success: false, error: e.toString() };
        }
        
        // Pattern 2: whose({...}) - no call
        try {
          const t2 = doc.flattenedTasks.whose({completed: false});
          results.pattern2 = { 
            success: true, 
            type: typeof t2,
            isFunction: typeof t2 === 'function',
            canCall: false
          };
          if (typeof t2 === 'function') {
            const called = t2();
            results.pattern2.canCall = true;
            results.pattern2.count = called.length;
          } else if (t2 && t2.length !== undefined) {
            results.pattern2.count = t2.length;
          }
        } catch (e) {
          results.pattern2 = { success: false, error: e.toString() };
        }
        
        // Pattern 3: Check if whose returns a specifier
        try {
          const specifier = doc.flattenedTasks.whose({completed: false});
          results.pattern3 = {
            type: Object.prototype.toString.call(specifier),
            hasLength: 'length' in specifier,
            properties: Object.getOwnPropertyNames(specifier).slice(0, 10)
          };
        } catch (e) {
          results.pattern3 = { error: e.toString() };
        }
        
        return JSON.stringify({ success: true, results });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `
  }
];

async function runWhoseTests() {
  console.log('Testing JXA whose() syntax limitations...\n');
  console.log('='.repeat(80));

  for (const test of testCases) {
    console.log(`\nTest: ${test.name}`);
    console.log('-'.repeat(test.name.length + 6));
    
    try {
      const result = await omni.execute(test.script);
      
      if (result) {
        console.log('Result:', JSON.stringify(result, null, 2));
      } else {
        console.log('Result: null/undefined');
      }
    } catch (error: any) {
      console.log('❌ Execution error:', error.message);
      if (error.stderr) {
        console.log('Stderr:', error.stderr);
      }
    }
    
    // Add delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('Testing complete!');
}

runWhoseTests().catch(console.error);
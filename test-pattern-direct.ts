import { PatternAnalysisTool } from './dist/tools/analytics/PatternAnalysisTool.js';
import { CacheManager } from './dist/cache/CacheManager.js';

async function test() {
  const cache = new CacheManager();
  const tool = new PatternAnalysisTool(cache);
  
  console.log('Testing pattern analysis with minimal parameters...');
  
  try {
    const result = await tool.execute({
      patterns: ['duplicates'],
      dormantThresholdDays: 30,
      includeCompleted: false,
      maxTasks: 500
    });
    
    console.log('✅ Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

test();
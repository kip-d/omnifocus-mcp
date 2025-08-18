#!/usr/bin/env npx tsx

import { OmniAutomation } from './src/omnifocus/OmniAutomation.js';
import { QUERY_PERSPECTIVE_SCRIPT } from './src/omnifocus/scripts/perspectives/query-perspective.js';

async function testPerspectiveQuery() {
  const omniAutomation = new OmniAutomation();
  
  console.log('Testing perspective query...\n');
  
  // Test with "Inbox" perspective
  const script = omniAutomation.buildScript(QUERY_PERSPECTIVE_SCRIPT, {
    perspectiveName: 'Inbox',
    limit: 10,
    includeDetails: false,
  });
  
  console.log('Script length:', script.length);
  
  // Find the queryScript part
  const queryScriptIndex = script.indexOf('const queryScript = [');
  if (queryScriptIndex > 0) {
    console.log('queryScript section (2000 chars):');
    console.log(script.substring(queryScriptIndex, queryScriptIndex + 2000));
    console.log('\n...\n');
  }
  
  try {
    const result = await omniAutomation.execute(script);
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log('\n✅ Direct OmniAutomation test completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    // Ensure process exits cleanly
    process.exit(0);
  }
}

testPerspectiveQuery().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
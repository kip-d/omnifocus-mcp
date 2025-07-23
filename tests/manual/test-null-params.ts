#!/usr/bin/env node
import { OmniAutomation } from '../../dist/omnifocus/OmniAutomation.js';

async function testNullParams() {
  const omni = new OmniAutomation();
  
  console.log('Testing null/undefined parameter handling...\n');
  
  // Test 1: null params
  try {
    const script1 = omni.buildScript('return "test {{value}}";', null as any);
    console.log('✓ Test 1 passed: null params handled correctly');
    console.log('  Generated script:', script1.substring(0, 50) + '...');
  } catch (error) {
    console.error('✗ Test 1 failed:', error);
  }
  
  // Test 2: undefined params
  try {
    const script2 = omni.buildScript('return "test {{value}}";', undefined as any);
    console.log('✓ Test 2 passed: undefined params handled correctly');
    console.log('  Generated script:', script2.substring(0, 50) + '...');
  } catch (error) {
    console.error('✗ Test 2 failed:', error);
  }
  
  // Test 3: params with null value
  try {
    const script3 = omni.buildScript('return "test {{obj}}";', { obj: null });
    console.log('✓ Test 3 passed: null object value formatted correctly');
    console.log('  Generated script:', script3.substring(0, 50) + '...');
  } catch (error) {
    console.error('✗ Test 3 failed:', error);
  }
  
  // Test 4: params with nested null - this was the bug case
  try {
    const script4 = omni.buildScript('return {{data}};', { 
      data: { 
        name: 'Test',
        value: null,
        nested: { prop: null }
      } 
    });
    console.log('✓ Test 4 passed: nested null values handled correctly');
    console.log('  Generated script:', script4.substring(0, 100) + '...');
  } catch (error) {
    console.error('✗ Test 4 failed:', error);
  }
  
  console.log('\nAll tests completed!');
}

testNullParams().catch(console.error);
#!/usr/bin/env node
import { OmniAutomation } from '../src/omnifocus/OmniAutomation.js';
import { RobustOmniAutomation } from '../src/omnifocus/RobustOmniAutomation.js';

async function testConnection() {
  console.log('Testing RobustOmniAutomation connection handling...\n');

  // Create instances
  const regular = new OmniAutomation();
  const robust = new RobustOmniAutomation();

  // Simple test script
  const testScript = `
    const tasks = doc.flattenedTasks();
    return JSON.stringify({
      success: true,
      taskCount: tasks ? tasks.length : 0,
      docAvailable: doc !== null && doc !== undefined
    });
  `;

  try {
    console.log('1. Testing regular OmniAutomation:');
    const regularResult = await regular.execute(testScript);
    console.log('Regular result:', regularResult);
  } catch (error: any) {
    console.log('Regular error:', error.message);
  }

  console.log('\n2. Testing RobustOmniAutomation:');
  try {
    const robustResult = await robust.execute(testScript);
    console.log('Robust result:', robustResult);
  } catch (error: any) {
    console.log('Robust error:', error.message);
    if (error.stderr) {
      console.log('Additional details:', error.stderr);
    }
  }

  console.log('\n3. Testing error enhancement for null conversion:');
  const errorScript = `
    const nullValue = null;
    const keys = Object.keys(nullValue);
    return JSON.stringify({ keys });
  `;

  try {
    const errorResult = await robust.execute(errorScript);
    console.log('Unexpected success:', errorResult);
  } catch (error: any) {
    console.log('Enhanced error message:', error.message);
  }
}

testConnection().catch(console.error);
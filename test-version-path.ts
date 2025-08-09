#!/usr/bin/env tsx

import { getVersionInfo } from './src/utils/version.js';

console.log('Testing package.json path resolution...');
console.log('Current working directory:', process.cwd());

try {
  const info = getVersionInfo();
  console.log('✅ Version info retrieved successfully');
  console.log('   Name:', info.name);
  console.log('   Version:', info.version);
  console.log('   Build ID:', info.build.buildId);
} catch (error) {
  console.error('❌ Version info failed:', error.message);
}
#!/usr/bin/env tsx

import { join } from 'path';
import { existsSync } from 'fs';

console.log('Current working directory:', process.cwd());
console.log('Package.json path:', join(process.cwd(), 'package.json'));
console.log('Package.json exists:', existsSync(join(process.cwd(), 'package.json')));

// Test from different directory
import { getVersionInfo } from './src/utils/version.js';
try {
  const info = getVersionInfo();
  console.log('Version info works:', info.name, info.version);
} catch (error) {
  console.error('Version info failed:', error.message);
}
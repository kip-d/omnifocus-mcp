#!/usr/bin/env node
console.log('Testing server startup...');

// Import and run the server directly
import('./dist/index.js').then(() => {
  console.log('Server imported successfully');
}).catch(err => {
  console.error('Error importing server:', err);
  process.exit(1);
});
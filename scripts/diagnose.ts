#!/usr/bin/env node
console.log('Testing server startup...');

// Import and run the server directly
import('src/index').then(() => {
  console.log('Server imported successfully');
}).catch((err: Error) => {
  console.error('Error importing server:', err);
  process.exit(1);
});
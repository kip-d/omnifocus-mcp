#!/usr/bin/env node

// Test RRULE generation for complex patterns
const { execSync } = require('child_process');

// Test the convertToRRULE function directly
const testScript = `
const app = Application('OmniFocus');

// Paste the convertToRRULE function here for testing
function convertToRRULE(rule) {
  if (!rule || !rule.unit || !rule.steps) return '';
  
  let rrule = '';
  
  // Basic frequency mapping
  switch (rule.unit) {
    case 'minute':
      rrule = 'FREQ=MINUTELY';
      break;
    case 'hour':
      rrule = 'FREQ=HOURLY';
      break;
    case 'day':
      rrule = 'FREQ=DAILY';
      break;
    case 'week':
      rrule = 'FREQ=WEEKLY';
      break;
    case 'month':
      rrule = 'FREQ=MONTHLY';
      break;
    case 'year':
      rrule = 'FREQ=YEARLY';
      break;
    default:
      return '';
  }
  
  // Add interval if > 1
  if (rule.steps > 1) {
    rrule += ';INTERVAL=' + rule.steps;
  }
  
  // Add weekdays for weekly patterns
  if (rule.weekdays && rule.weekdays.length > 0) {
    const weekdayMap = {
      'sunday': 'SU',
      'monday': 'MO', 
      'tuesday': 'TU',
      'wednesday': 'WE',
      'thursday': 'TH',
      'friday': 'FR',
      'saturday': 'SA'
    };
    
    const days = rule.weekdays.map(function(day) {
      return weekdayMap[day] || '';
    }).filter(function(day) {
      return day !== '';
    }).join(',');
    
    if (days) {
      rrule += ';BYDAY=' + days;
    }
  }
  
  return rrule;
}

// Test cases
const testCases = [
  {
    name: 'Weekly Mon/Wed/Fri',
    rule: {
      unit: 'week',
      steps: 1,
      weekdays: ['monday', 'wednesday', 'friday']
    }
  },
  {
    name: 'Daily',
    rule: {
      unit: 'day',
      steps: 1
    }
  },
  {
    name: 'Every 2 weeks on Tuesday',
    rule: {
      unit: 'week',
      steps: 2,
      weekdays: ['tuesday']
    }
  }
];

const results = [];
for (const test of testCases) {
  const rrule = convertToRRULE(test.rule);
  results.push(test.name + ': ' + rrule);
}

results.join('\\n');
`;

try {
  console.log('Testing RRULE generation...\n');
  const result = execSync(`osascript -l JavaScript -e '${testScript.replace(/'/g, "'\"'\"'")}'`, { encoding: 'utf8' });
  console.log('Generated RRULEs:');
  console.log(result);
  
  // Now test if these RRULEs work with Task.RepetitionRule
  console.log('\nTesting Task.RepetitionRule with generated RRULE...');
  
  const validationScript = `
const app = Application('OmniFocus');

// Test if Task.RepetitionRule accepts our RRULE
const testRrule = 'FREQ=WEEKLY;BYDAY=MO,WE,FR';

const result = app.evaluateJavascript(
  'try {' +
  '  const rule = new Task.RepetitionRule("' + testRrule + '", Task.RepetitionMethod.Fixed);' +
  '  "SUCCESS: RepetitionRule created with: " + rule.ruleString;' +
  '} catch (e) {' +
  '  "ERROR: " + e.toString();' +
  '}'
);

result;
`;
  
  const validationResult = execSync(`osascript -l JavaScript -e '${validationScript.replace(/'/g, "'\"'\"'")}'`, { encoding: 'utf8' });
  console.log('Validation result:', validationResult.trim());
  
} catch (error) {
  console.error('Error:', error.message);
}
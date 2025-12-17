#!/usr/bin/env node

/**
 * JXA Performance Profiling Script
 *
 * This script profiles different aspects of JXA performance to identify
 * the actual bottlenecks and optimization potential.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Profiling test script that measures different operations
const PROFILE_SCRIPT = `
  const app = Application('OmniFocus');
  const doc = app.defaultDocument;
  
  const results = {
    timings: {},
    counts: {},
    breakdown: {}
  };
  
  // Helper to measure time
  function measure(name, fn) {
    const start = Date.now();
    const result = fn();
    const elapsed = Date.now() - start;
    results.timings[name] = elapsed;
    return result;
  }
  
  // Test 1: Initial enumeration
  const allTasks = measure('1_enumerate_all_tasks', () => {
    return doc.flattenedTasks();
  });
  
  results.counts.total_tasks = allTasks.length;
  
  // Test 2: Single property access on all tasks
  measure('2_single_prop_all_tasks', () => {
    let count = 0;
    for (let i = 0; i < allTasks.length; i++) {
      try {
        const name = allTasks[i].name();
        if (name) count++;
      } catch (e) {}
    }
    results.counts.named_tasks = count;
  });
  
  // Test 3: Multiple property access on subset (100 tasks)
  const subset = allTasks.slice(0, 100);
  measure('3_multi_prop_100_tasks', () => {
    const tasks = [];
    for (let i = 0; i < subset.length; i++) {
      const task = subset[i];
      try {
        tasks.push({
          name: task.name(),
          completed: task.completed(),
          flagged: task.flagged(),
          dueDate: task.dueDate(),
          deferDate: task.deferDate()
        });
      } catch (e) {}
    }
    results.counts.processed_subset = tasks.length;
  });
  
  // Test 4: SafeGet overhead measurement
  function safeGet(fn, defaultVal) {
    try {
      return fn();
    } catch (e) {
      return defaultVal;
    }
  }
  
  measure('4_with_safget_100_tasks', () => {
    const tasks = [];
    for (let i = 0; i < subset.length; i++) {
      const task = subset[i];
      tasks.push({
        name: safeGet(() => task.name(), ''),
        completed: safeGet(() => task.completed(), false),
        flagged: safeGet(() => task.flagged(), false),
        dueDate: safeGet(() => task.dueDate(), null),
        deferDate: safeGet(() => task.deferDate(), null)
      });
    }
  });
  
  // Test 5: Direct try-catch (v3 optimization style)
  measure('5_direct_trycatch_100_tasks', () => {
    const tasks = [];
    for (let i = 0; i < subset.length; i++) {
      const task = subset[i];
      try {
        tasks.push({
          name: task.name(),
          completed: task.completed(),
          flagged: task.flagged(),
          dueDate: task.dueDate(),
          deferDate: task.deferDate()
        });
      } catch (e) {
        // Skip errored task
      }
    }
  });
  
  // Test 6: Project access overhead
  measure('6_project_access_100_tasks', () => {
    let count = 0;
    for (let i = 0; i < subset.length; i++) {
      try {
        const project = subset[i].containingProject();
        if (project) {
          const name = project.name();
          if (name) count++;
        }
      } catch (e) {}
    }
    results.counts.tasks_with_projects = count;
  });
  
  // Test 7: Tag access overhead
  measure('7_tag_access_100_tasks', () => {
    let totalTags = 0;
    for (let i = 0; i < subset.length; i++) {
      try {
        const tags = subset[i].tags();
        totalTags += tags.length;
      } catch (e) {}
    }
    results.counts.total_tags = totalTags;
  });
  
  // Test 8: Date operations
  measure('8_date_filtering_all_tasks', () => {
    const now = new Date();
    let overdueCount = 0;
    for (let i = 0; i < allTasks.length; i++) {
      try {
        if (allTasks[i].completed()) continue;
        const dueDate = allTasks[i].dueDate();
        if (dueDate && dueDate < now) {
          overdueCount++;
        }
      } catch (e) {}
    }
    results.counts.overdue_tasks = overdueCount;
  });
  
  // Test 9: whose() clause performance (the known bad one)
  measure('9_whose_completed_false', () => {
    const incompleteTasks = doc.flattenedTasks.whose({completed: false})();
    results.counts.incomplete_via_whose = incompleteTasks.length;
  });
  
  // Test 10: Manual filtering (current approach)
  measure('10_manual_filter_completed', () => {
    let count = 0;
    for (let i = 0; i < allTasks.length; i++) {
      try {
        if (!allTasks[i].completed()) count++;
      } catch (e) {}
    }
    results.counts.incomplete_via_manual = count;
  });
  
  // Calculate breakdown percentages
  const totalTime = Object.values(results.timings).reduce((a, b) => a + b, 0);
  for (const [key, value] of Object.entries(results.timings)) {
    results.breakdown[key] = {
      ms: value,
      percent: ((value / totalTime) * 100).toFixed(1) + '%'
    };
  }
  
  // Calculate specific insights
  const enumTime = results.timings['1_enumerate_all_tasks'];
  const singlePropTime = results.timings['2_single_prop_all_tasks'];
  const multiPropTime = results.timings['3_multi_prop_100_tasks'];
  const safeGetTime = results.timings['4_with_safget_100_tasks'];
  const directTime = results.timings['5_direct_trycatch_100_tasks'];
  
  results.insights = {
    ms_per_task_enumeration: (enumTime / results.counts.total_tasks).toFixed(3),
    ms_per_property_access: (singlePropTime / results.counts.total_tasks).toFixed(3),
    ms_per_task_full_read: (multiPropTime / 100).toFixed(3),
    safget_overhead_percent: (((safeGetTime - directTime) / safeGetTime) * 100).toFixed(1) + '%',
    safget_overhead_ms: (safeGetTime - directTime),
    whose_vs_manual_ratio: (results.timings['9_whose_completed_false'] / results.timings['10_manual_filter_completed']).toFixed(1) + 'x slower'
  };
  
  JSON.stringify(results, null, 2);
`;

console.log('🔬 Starting JXA Performance Profiling...\n');
console.log('This will measure actual bottlenecks in OmniFocus JXA operations.');
console.log('Please ensure OmniFocus is running with a typical database.\n');

// Execute the profiling script
const proc = spawn('osascript', ['-l', 'JavaScript', '-e', PROFILE_SCRIPT]);

let output = '';
let error = '';

proc.stdout.on('data', (data) => {
  output += data.toString();
});

proc.stderr.on('data', (data) => {
  error += data.toString();
});

proc.on('close', (code) => {
  if (code !== 0) {
    console.error('❌ Profiling failed:', error);
    process.exit(1);
  }

  try {
    const results = JSON.parse(output);

    console.log('✅ Profiling Complete!\n');
    console.log('='.repeat(60));
    console.log('DATABASE SIZE');
    console.log('='.repeat(60));
    console.log(`Total tasks: ${results.counts.total_tasks}`);
    console.log(`Incomplete tasks: ${results.counts.incomplete_via_manual}`);
    console.log(`Overdue tasks: ${results.counts.overdue_tasks}`);
    console.log('');

    console.log('='.repeat(60));
    console.log('TIMING BREAKDOWN');
    console.log('='.repeat(60));
    for (const [key, data] of Object.entries(results.breakdown)) {
      const name = key.substring(2).replace(/_/g, ' ');
      console.log(`${name.padEnd(35)} ${String(data.ms + 'ms').padStart(8)} (${data.percent})`);
    }
    console.log('');

    console.log('='.repeat(60));
    console.log('KEY INSIGHTS');
    console.log('='.repeat(60));
    console.log(`Per-task enumeration cost: ${results.insights.ms_per_task_enumeration}ms`);
    console.log(`Per-property access cost: ${results.insights.ms_per_property_access}ms`);
    console.log(`Full task read (5 props): ${results.insights.ms_per_task_full_read}ms`);
    console.log(
      `SafeGet overhead: ${results.insights.safget_overhead_ms}ms (${results.insights.safget_overhead_percent})`,
    );
    console.log(`whose() vs manual filter: ${results.insights.whose_vs_manual_ratio}`);
    console.log('');

    console.log('='.repeat(60));
    console.log('OPTIMIZATION POTENTIAL');
    console.log('='.repeat(60));

    const totalMs = Object.values(results.timings).reduce((a, b) => a + b, 0);
    const safeGetSavings = results.insights.safget_overhead_ms;
    const potentialPercent = ((safeGetSavings / totalMs) * 100).toFixed(1);

    console.log(`Removing safeGet could save: ${safeGetSavings}ms (${potentialPercent}% of total)`);

    // Extrapolate to full query
    const tasksPerQuery = 100;
    const propsPerTask = 10; // Typical full query
    const estimatedSafeGetOverhead = (safeGetSavings / 100) * tasksPerQuery * (propsPerTask / 5);
    console.log(
      `Estimated savings for ${tasksPerQuery} tasks with ${propsPerTask} properties: ${estimatedSafeGetOverhead.toFixed(0)}ms`,
    );

    // Show where time is really spent
    const enumPercent = ((results.timings['1_enumerate_all_tasks'] / totalMs) * 100).toFixed(1);
    const propAccessPercent = ((results.timings['2_single_prop_all_tasks'] / totalMs) * 100).toFixed(1);

    console.log('');
    console.log('Where time is REALLY spent:');
    console.log(`- Task enumeration: ${enumPercent}%`);
    console.log(`- Property access: ${propAccessPercent}%`);
    console.log(
      `- JavaScript processing: ~${(100 - parseFloat(enumPercent) - parseFloat(propAccessPercent)).toFixed(1)}%`,
    );

    // Save detailed results
    const resultsPath = join(__dirname, 'profile-results.json');
    writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`\n📊 Detailed results saved to: ${resultsPath}`);
  } catch (e) {
    console.error('Failed to parse results:', e);
    console.log('Raw output:', output);
  }
});

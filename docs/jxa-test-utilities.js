#!/usr/bin/env osascript -l JavaScript

/**
 * JXA Test Utilities for OmniFocus
 * 
 * This file consolidates the useful test functions we created during our
 * API discovery journey. Use these to explore the OmniFocus JXA API.
 * 
 * Run with: osascript -l JavaScript docs/jxa-test-utilities.js
 */

// Test whose() performance vs iteration
function testWhosePerformance() {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const taskId = doc.flattenedTasks()[0].id();
    
    console.log("=== Testing whose() vs iteration performance ===");
    
    // Test whose()
    const start1 = Date.now();
    const result1 = doc.flattenedTasks.whose({id: taskId});
    const time1 = Date.now() - start1;
    console.log(`whose(): ${time1}ms, found: ${result1[0].name()}`);
    
    // Test iteration
    const start2 = Date.now();
    let result2 = null;
    const tasks = doc.flattenedTasks();
    for (let i = 0; i < tasks.length; i++) {
        if (tasks[i].id() === taskId) {
            result2 = tasks[i];
            break;
        }
    }
    const time2 = Date.now() - start2;
    console.log(`iteration: ${time2}ms, found: ${result2.name()}`);
    console.log(`whose() is ${(time2/time1).toFixed(1)}x faster`);
}

// Discover available properties on an object
function discoverProperties(obj, objName) {
    console.log(`\n=== Properties of ${objName} ===`);
    
    // Common task/project properties to test
    const properties = [
        'name', 'id', 'note', 'completed', 'flagged',
        'deferDate', 'dueDate', 'completionDate',
        'blocked', 'next', 'dropped', 'inInbox',
        'effectiveDeferDate', 'effectiveDueDate',
        'effectivelyCompleted', 'effectivelyDropped',
        'numberOfTasks', 'numberOfAvailableTasks',
        'estimatedMinutes', 'repetitionRule',
        'creationDate', 'modificationDate'
    ];
    
    properties.forEach(prop => {
        try {
            const value = obj[prop]();
            console.log(`${prop}: ${value}`);
        } catch (e) {
            // Property doesn't exist or threw error
        }
    });
}

// Test collection types and counts
function testCollections() {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    console.log("\n=== Collection Types and Counts ===");
    
    const collections = [
        ['doc.tasks()', () => doc.tasks()],
        ['doc.flattenedTasks()', () => doc.flattenedTasks()],
        ['doc.inboxTasks()', () => doc.inboxTasks()],
        ['doc.projects()', () => doc.projects()],
        ['doc.flattenedProjects()', () => doc.flattenedProjects()],
        ['doc.tags()', () => doc.tags()],
        ['doc.flattenedTags()', () => doc.flattenedTags()]
    ];
    
    collections.forEach(([name, fn]) => {
        try {
            const result = fn();
            console.log(`${name}: ${result.length} items`);
        } catch (e) {
            console.log(`${name}: Error - ${e.message}`);
        }
    });
}

// Test complex whose() queries
function testComplexQueries() {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    console.log("\n=== Complex whose() Queries ===");
    
    const queries = [
        ['Flagged incomplete', {completed: false, flagged: true}],
        ['In inbox', {inInbox: true}],
        ['Available (unblocked)', {blocked: false, completed: false}],
        ['Due today or overdue', {
            completed: false,
            dueDate: {_lessThanEquals: new Date()}
        }]
    ];
    
    queries.forEach(([desc, condition]) => {
        try {
            const results = doc.flattenedTasks.whose(condition);
            console.log(`${desc}: ${results.length} tasks`);
            if (results.length > 0 && results.length <= 3) {
                results.slice(0, 3).forEach(task => {
                    console.log(`  - ${task.name()}`);
                });
            }
        } catch (e) {
            console.log(`${desc}: Error - ${e.message}`);
        }
    });
}

// Main test runner
function runTests() {
    console.log("OmniFocus JXA Test Utilities");
    console.log("============================\n");
    
    testWhosePerformance();
    
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    const task = doc.flattenedTasks()[0];
    discoverProperties(task, 'Task');
    
    const project = doc.flattenedProjects()[0];
    if (project) {
        discoverProperties(project.rootTask(), 'Project Root Task');
    }
    
    testCollections();
    testComplexQueries();
}

// Run tests if executed directly
if (typeof this === 'undefined' || !this.module) {
    runTests();
}
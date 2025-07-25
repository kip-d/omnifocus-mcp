#!/usr/bin/env osascript -l JavaScript

function testCollectionsDifference() {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    console.log("=== Testing Collection Differences ===\n");
    
    console.log("1. Comparing collections:");
    
    // Test different collection accessors
    const collections = [
        'tasks',
        'flattenedTasks',
        'projects', 
        'flattenedProjects',
        'folders',
        'flattenedFolders',
        'tags',
        'flattenedTags'
    ];
    
    collections.forEach(name => {
        try {
            console.log(`\n${name}:`);
            const collection = doc[name];
            console.log(`  Type: ${typeof collection}`);
            
            if (typeof collection === 'function') {
                const result = collection();
                console.log(`  Called as function: ${result.length} items`);
                console.log(`  Has 'whose': ${typeof result.whose}`);
                
                // Check first item if any
                if (result.length > 0) {
                    console.log(`  First item type: ${typeof result[0]}`);
                    console.log(`  First item has name(): ${typeof result[0].name}`);
                }
                
                // Check what methods are available
                const methods = [];
                for (let prop in result) {
                    if (typeof result[prop] === 'function' && isNaN(parseInt(prop))) {
                        methods.push(prop);
                    }
                }
                if (methods.length > 0) {
                    console.log(`  Methods found: ${methods.slice(0, 5).join(', ')}`);
                }
            }
        } catch (e) {
            console.log(`  Error: ${e.toString()}`);
        }
    });
    
    console.log("\n2. Testing 'whose' availability:");
    
    // Explicitly test where whose works
    try {
        console.log("  doc.flattenedTasks.whose:");
        console.log("    Type:", typeof doc.flattenedTasks.whose);
        
        console.log("  doc.flattenedTasks().whose:");
        const ft = doc.flattenedTasks();
        console.log("    Type:", typeof ft.whose);
        
        console.log("  doc.tasks.whose:");
        console.log("    Type:", typeof doc.tasks.whose);
        
        console.log("  doc.tasks().whose:");
        const t = doc.tasks();
        console.log("    Type:", typeof t.whose);
    } catch (e) {
        console.log("  Error:", e.toString());
    }
    
    console.log("\n3. Critical discovery - 'whose' is on the function, not the result!");
    
    // This is the key insight!
    try {
        const taskId = doc.flattenedTasks()[0].id();
        
        console.log("  Testing the RIGHT way:");
        console.log("    doc.flattenedTasks.whose({id: taskId}):");
        const result1 = doc.flattenedTasks.whose({id: taskId});
        console.log("      Success! Found", result1.length, "items");
        if (result1.length > 0) {
            console.log("      Task name:", result1[0].name());
        }
        
        console.log("\n  Testing the WRONG way:");
        console.log("    doc.flattenedTasks().whose({id: taskId}):");
        try {
            const tasks = doc.flattenedTasks();
            const result2 = tasks.whose({id: taskId});
            console.log("      Found", result2.length, "items");
        } catch (e) {
            console.log("      Error:", e.toString());
        }
    } catch (e) {
        console.log("  Error:", e.toString());
    }
    
    console.log("\n4. So what's the difference between tasks and flattenedTasks?");
    
    try {
        // Get some info about structure
        const tasks = doc.tasks();
        const flatTasks = doc.flattenedTasks();
        
        console.log("  doc.tasks():", tasks.length, "items");
        console.log("  doc.flattenedTasks():", flatTasks.length, "items");
        
        // In OmniFocus, tasks() might only return root-level tasks
        // while flattenedTasks() returns all tasks recursively
        
        if (tasks.length > 0) {
            console.log("\n  First task from tasks():");
            console.log("    Name:", tasks[0].name());
            console.log("    Has children:", tasks[0].numberOfChildren() > 0);
        }
        
        // Find a task with subtasks
        console.log("\n  Looking for tasks with children:");
        let found = 0;
        for (let i = 0; i < Math.min(100, flatTasks.length); i++) {
            const task = flatTasks[i];
            if (task.numberOfChildren() > 0) {
                console.log(`    "${task.name()}" has ${task.numberOfChildren()} children`);
                found++;
                if (found >= 3) break;
            }
        }
    } catch (e) {
        console.log("  Error:", e.toString());
    }
}

testCollectionsDifference();
#!/usr/bin/env osascript -l JavaScript

function exploreAppleScriptBridge() {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    console.log("=== Exploring AppleScript Bridge Methods ===\n");
    
    // 1. Check AppleScript dictionary methods
    console.log("1. Checking if methods are AppleScript commands:");
    
    // In AppleScript, you might say: tell document to get task with id "xyz"
    // Let's see if that translates to JXA
    
    const taskId = doc.flattenedTasks()[0].id();
    console.log("Test task ID:", taskId);
    
    // Try different syntaxes that might match AppleScript
    console.log("\n2. Testing AppleScript-style access:");
    
    // "get task with id X"
    try {
        console.log("  a) doc.tasks.whose({id: taskId})[0]:");
        const result = doc.tasks.whose({id: taskId})[0];
        console.log("    Success! Result:", result);
        if (result) console.log("    Name:", result.name());
    } catch (e) {
        console.log("    Error:", e.toString());
    }
    
    // Check if 'tasks' property exists
    try {
        console.log("  b) doc.tasks (collection):");
        const tasks = doc.tasks;
        console.log("    Type:", typeof tasks);
        console.log("    Length:", tasks.length);
        if (tasks.length > 0) {
            console.log("    First task:", tasks[0].name());
        }
    } catch (e) {
        console.log("    Error:", e.toString());
    }
    
    // 3. Explore collections vs methods
    console.log("\n3. Collections available on document:");
    const collections = [
        'tasks', 'projects', 'folders', 'tags', 'contexts',
        'flattenedTasks', 'flattenedProjects', 'flattenedFolders', 'flattenedTags',
        'inboxTasks', 'remainingTasks', 'completedTasks'
    ];
    
    collections.forEach(coll => {
        try {
            const collection = doc[coll];
            if (collection !== undefined) {
                const type = typeof collection;
                if (type === 'function') {
                    // It's a method, call it
                    const result = collection.call(doc);
                    console.log(`  ${coll}(): ${result.length} items`);
                } else {
                    // It's a property
                    console.log(`  ${coll}: ${type}`);
                }
            }
        } catch (e) {
            // Silent fail
        }
    });
    
    // 4. Test element access patterns
    console.log("\n4. Testing element access patterns:");
    
    // In AppleScript: "task id X of document"
    try {
        console.log("  a) doc.tasks[taskId] (by ID as key):");
        const result = doc.tasks[taskId];
        console.log("    Result:", result);
    } catch (e) {
        console.log("    Error:", e.toString());
    }
    
    // Try byId() method
    try {
        console.log("  b) doc.tasks.byId(taskId):");
        const result = doc.tasks.byId(taskId);
        console.log("    Result:", result);
    } catch (e) {
        console.log("    Error:", e.toString());
    }
    
    // 5. Check app-level methods
    console.log("\n5. App-level task access:");
    
    try {
        console.log("  a) app.tasks:");
        const tasks = app.tasks;
        console.log("    Type:", typeof tasks);
    } catch (e) {
        console.log("    Error:", e.toString());
    }
    
    // 6. Inspect actual AppleScript commands
    console.log("\n6. Available properties/methods on collections:");
    
    const flatTasks = doc.flattenedTasks();
    console.log("  doc.flattenedTasks() methods:");
    // Get methods that aren't numeric indices
    const methods = Object.getOwnPropertyNames(flatTasks)
        .filter(p => isNaN(parseInt(p)) && p !== 'length' && p !== '__private__')
        .slice(0, 10);
    console.log("    ", methods.join(', '));
    
    // Check if whose is a method or property
    console.log("\n  typeof flatTasks.whose:", typeof flatTasks.whose);
    if (flatTasks.whose) {
        console.log("  flatTasks.whose.toString():", flatTasks.whose.toString());
    }
}

exploreAppleScriptBridge();
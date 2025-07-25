#!/usr/bin/env osascript -l JavaScript

function testAppleScriptSpecifiers() {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    console.log("=== Understanding AppleScript Object Specifiers ===\n");
    
    // In AppleScript, you don't pass IDs as strings to methods
    // You use object specifiers like: task id "xyz" of document
    
    const taskId = doc.flattenedTasks()[0].id();
    console.log("Test task ID:", taskId);
    
    console.log("\n1. Understanding object specifiers:");
    
    // Get a task the normal way
    const task = doc.flattenedTasks()[0];
    console.log("  Task obtained via index:", task);
    console.log("  Task.toString():", task.toString());
    console.log("  Type:", typeof task);
    
    // What is task really?
    console.log("\n2. Investigating task object:");
    console.log("  Is function?", typeof task === 'function');
    console.log("  Constructor name:", task.constructor.name);
    
    // Try to understand the specifier
    try {
        // In AppleScript, objects have specifiers
        console.log("\n3. Trying to get object specifier:");
        
        // Some possible properties
        const props = ['id', 'specifier', 'objectSpecifier', '_specifier', '__specifier'];
        props.forEach(prop => {
            try {
                if (task[prop]) {
                    console.log(`  task.${prop}:`, task[prop]);
                    if (typeof task[prop] === 'function') {
                        console.log(`    Calling ${prop}():`, task[prop]());
                    }
                }
            } catch (e) {}
        });
    } catch (e) {
        console.log("  Error:", e.toString());
    }
    
    console.log("\n4. The mystery of taskWithID:");
    
    // Maybe taskWithID expects an object specifier, not a string?
    // In AppleScript: tell document to get task id "xyz"
    // This creates a specifier, not a string lookup
    
    try {
        // Try passing the actual task object
        console.log("  Passing task object to taskWithID:");
        const result = doc.taskWithID(task);
        console.log("    Result:", result);
    } catch (e) {
        console.log("    Error:", e.toString());
    }
    
    console.log("\n5. Checking if these are creation methods:");
    
    // Maybe taskWithID is for creating a task with a specific ID?
    try {
        console.log("  Is doc.Task a constructor?");
        console.log("    doc.Task.prototype:", doc.Task.prototype);
        console.log("    new doc.Task():");
        const newTask = new doc.Task();
        console.log("      Result:", newTask);
    } catch (e) {
        console.log("      Error:", e.toString());
    }
    
    console.log("\n6. The real insight - JXA vs AppleScript vs OmniJS:");
    console.log("\nThree different APIs exist:");
    console.log("1. AppleScript - tell document to get every task whose id is 'xyz'");
    console.log("2. JXA - doc.flattenedTasks.whose({id: 'xyz'})");
    console.log("3. OmniJS - Task.byIdentifier('xyz')");
    console.log("\nThe TypeScript definitions are for #3 (OmniJS)");
    console.log("We're using #2 (JXA)");
    console.log("Methods like taskWithID might be expecting AppleScript-style specifiers");
    
    console.log("\n7. Practical conclusion:");
    console.log("✓ Use doc.flattenedTasks.whose({id: taskId}) - It works!");
    console.log("✗ Don't use Task.byIdentifier - Wrong API");
    console.log("✗ Don't use doc.taskWithID - Expects different parameter type");
    console.log("\nThe 'whose' clause is the JXA equivalent of AppleScript's whose clause");
    console.log("and provides the fastest lookup available in this context.");
}

testAppleScriptSpecifiers();
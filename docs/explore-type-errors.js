#!/usr/bin/env osascript -l JavaScript

function exploreTypeErrors() {
    const app = Application('OmniFocus');
    app.includeStandardAdditions = true;
    const doc = app.defaultDocument();
    
    console.log("=== Exploring 'Can't convert types' Errors ===\n");
    
    // Get a real task ID for testing
    const tasks = doc.flattenedTasks();
    if (tasks.length === 0) {
        console.log("No tasks found for testing");
        return;
    }
    
    const testTask = tasks[0];
    const taskId = testTask.id();
    console.log(`Test task: "${testTask.name()}"`);
    console.log(`Task ID: ${taskId}\n`);
    
    // 1. Test doc.Task.byIdentifier with different approaches
    console.log("1. Testing doc.Task.byIdentifier variations:");
    
    // Try with string
    try {
        console.log("  a) doc.Task.byIdentifier(string):");
        const result = doc.Task.byIdentifier(taskId);
        console.log("    Success! Result:", result);
        if (result) console.log("    Task name:", result.name());
    } catch (e) {
        console.log("    Error:", e.toString());
    }
    
    // Try with object wrapper
    try {
        console.log("  b) doc.Task.byIdentifier({id: string}):");
        const result = doc.Task.byIdentifier({id: taskId});
        console.log("    Success! Result:", result);
    } catch (e) {
        console.log("    Error:", e.toString());
    }
    
    // Try calling it differently
    try {
        console.log("  c) doc.Task.byIdentifier.call(doc, taskId):");
        const result = doc.Task.byIdentifier.call(doc, taskId);
        console.log("    Success! Result:", result);
    } catch (e) {
        console.log("    Error:", e.toString());
    }
    
    // 2. Test doc.taskWithID
    console.log("\n2. Testing doc.taskWithID variations:");
    
    try {
        console.log("  a) doc.taskWithID(string):");
        const result = doc.taskWithID(taskId);
        console.log("    Success! Result:", result);
        if (result) console.log("    Task name:", result.name());
    } catch (e) {
        console.log("    Error:", e.toString());
    }
    
    // Try with different parameter types
    try {
        console.log("  b) doc.taskWithID({id: string}):");
        const result = doc.taskWithID({id: taskId});
        console.log("    Success! Result:", result);
    } catch (e) {
        console.log("    Error:", e.toString());
    }
    
    // 3. Test if these are properties or methods
    console.log("\n3. Checking method vs property:");
    console.log("  typeof doc.taskWithID:", typeof doc.taskWithID);
    console.log("  doc.taskWithID.length:", doc.taskWithID.length);
    console.log("  doc.taskWithID.toString():", doc.taskWithID.toString());
    
    // 4. Try getting a project
    console.log("\n4. Testing with projects:");
    const projects = doc.flattenedProjects();
    if (projects.length > 0) {
        const project = projects[0];
        const projectId = project.id();
        console.log(`  Project: "${project.name()}"`);
        console.log(`  Project ID: ${projectId}`);
        
        try {
            console.log("  doc.projectWithID(projectId):");
            const result = doc.projectWithID(projectId);
            console.log("    Success! Result:", result);
        } catch (e) {
            console.log("    Error:", e.toString());
        }
        
        try {
            console.log("  doc.Project.byIdentifier(projectId):");
            const result = doc.Project.byIdentifier(projectId);
            console.log("    Success! Result:", result);
        } catch (e) {
            console.log("    Error:", e.toString());
        }
    }
    
    // 5. Explore what doc.Task actually is
    console.log("\n5. What is doc.Task?");
    console.log("  typeof doc.Task:", typeof doc.Task);
    console.log("  doc.Task.toString():", doc.Task.toString());
    console.log("  doc.Task.name:", doc.Task.name);
    console.log("  Is it the constructor?", doc.Task === testTask.constructor);
    
    // Try creating a new task?
    try {
        console.log("  Trying new doc.Task():");
        const newTask = new doc.Task();
        console.log("    Success! Created:", newTask);
    } catch (e) {
        console.log("    Error:", e.toString());
    }
    
    // 6. Check if it's a class/constructor issue
    console.log("\n6. Checking constructors and prototypes:");
    console.log("  testTask.constructor:", testTask.constructor);
    console.log("  testTask.constructor.name:", testTask.constructor.name);
    if (testTask.constructor.byIdentifier) {
        console.log("  testTask.constructor.byIdentifier exists!");
        try {
            const result = testTask.constructor.byIdentifier(taskId);
            console.log("    Result:", result);
        } catch (e) {
            console.log("    Error:", e.toString());
        }
    }
}

exploreTypeErrors();
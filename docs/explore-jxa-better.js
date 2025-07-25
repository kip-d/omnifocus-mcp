#!/usr/bin/env osascript -l JavaScript

function exploreAPI() {
    const app = Application('OmniFocus');
    app.includeStandardAdditions = true;
    
    console.log("=== OmniFocus JXA API Explorer ===\n");
    
    // 1. Document properties
    const doc = app.defaultDocument();
    console.log("1. Document Properties (filtered):");
    const docProps = Object.getOwnPropertyNames(doc)
        .filter(p => !p.match(/^\d+$/) && p !== '__private__')
        .sort();
    console.log(docProps.join(', '));
    
    // 2. Collections available
    console.log("\n2. Document Collections:");
    const collections = [
        'flattenedTasks',
        'flattenedProjects', 
        'flattenedFolders',
        'flattenedTags',
        'flattenedContexts',
        'inboxTasks'
    ];
    
    collections.forEach(coll => {
        try {
            const items = doc[coll];
            if (items) {
                console.log(`  ${coll}: ${items.length} items`);
            }
        } catch (e) {
            console.log(`  ${coll}: Not available`);
        }
    });
    
    // 3. Task properties
    console.log("\n3. Task Properties:");
    const tasks = doc.flattenedTasks();
    if (tasks.length > 0) {
        const task = tasks[0];
        const taskProps = Object.getOwnPropertyNames(task)
            .filter(p => !p.match(/^\d+$/) && p !== '__private__')
            .sort();
        console.log(taskProps.join(', '));
        
        // 4. Task method examples
        console.log("\n4. Sample Task Data:");
        console.log(`  name: ${task.name()}`);
        console.log(`  id: ${task.id()}`);
        console.log(`  completed: ${task.completed()}`);
        console.log(`  flagged: ${task.flagged()}`);
        console.log(`  inInbox: ${task.inInbox()}`);
        
        // Test properties that might exist
        try { console.log(`  note: ${task.note()}`); } catch(e) {}
        try { console.log(`  dueDate: ${task.dueDate()}`); } catch(e) {}
        try { console.log(`  deferDate: ${task.deferDate()}`); } catch(e) {}
    }
    
    // 5. Check whose() filtering
    console.log("\n5. Testing whose() Filtering:");
    try {
        const incompleteTasks = doc.flattenedTasks.whose({completed: false});
        console.log(`  Incomplete tasks: ${incompleteTasks.length}`);
    } catch (e) {
        console.log(`  whose() filtering error: ${e.message}`);
    }
    
    // 6. Check for Task namespace
    console.log("\n6. Namespace Availability:");
    console.log(`  typeof Task: ${typeof Task}`);
    console.log(`  typeof app.Task: ${typeof app.Task}`);
    console.log(`  typeof doc.Task: ${typeof doc.Task}`);
    
    // Try to find Task in various places
    if (typeof app.Task !== 'undefined') {
        console.log("  app.Task properties:", Object.getOwnPropertyNames(app.Task));
    }
    
    // 7. Project properties
    console.log("\n7. Project Properties:");
    const projects = doc.flattenedProjects();
    if (projects.length > 0) {
        const project = projects[0];
        const projProps = Object.getOwnPropertyNames(project)
            .filter(p => !p.match(/^\d+$/) && p !== '__private__')
            .sort();
        console.log(projProps.join(', '));
    }
    
    // 8. Application properties
    console.log("\n8. Application Properties:");
    const appProps = Object.getOwnPropertyNames(app)
        .filter(p => !p.match(/^\d+$/) && p !== '__private__')
        .sort();
    console.log(appProps.slice(0, 20).join(', ') + '...');
}

// Run the exploration
exploreAPI();
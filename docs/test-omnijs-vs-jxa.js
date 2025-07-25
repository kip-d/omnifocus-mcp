#!/usr/bin/env osascript -l JavaScript

function testOmniJSvsJXA() {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    console.log("=== Testing OmniJS vs JXA Context ===\n");
    
    // The TypeScript definitions might be for OmniJS (Omni's JavaScript API)
    // not JXA (Apple's JavaScript for Automation)
    
    console.log("1. Checking for OmniJS global objects:");
    
    // OmniJS would have these globals
    const omniJSGlobals = [
        'Document', 'Task', 'Project', 'Tag', 'Folder',
        'Database', 'Perspective', 'Window', 'Selection'
    ];
    
    omniJSGlobals.forEach(global => {
        try {
            const value = eval(global);
            console.log(`  ${global}:`, typeof value, value ? "exists" : "undefined");
        } catch (e) {
            console.log(`  ${global}: not defined`);
        }
    });
    
    console.log("\n2. Checking app context:");
    console.log("  app.name():", app.name());
    console.log("  app.version():", app.version());
    console.log("  app.id():", app.id());
    
    // Check if we're in OmniJS plugin context
    console.log("\n3. Checking execution context:");
    console.log("  typeof console:", typeof console);
    console.log("  typeof require:", typeof require);
    console.log("  typeof module:", typeof module);
    console.log("  typeof PlugIn:", typeof PlugIn);
    console.log("  typeof Action:", typeof Action);
    
    // 4. Try OmniJS-style access
    console.log("\n4. Testing OmniJS-style access patterns:");
    
    // In OmniJS, you might access Task.byIdentifier directly
    try {
        console.log("  Direct Task access (OmniJS style):");
        if (typeof Task !== 'undefined') {
            console.log("    Task exists globally!");
            console.log("    Task.byIdentifier:", Task.byIdentifier);
        } else {
            console.log("    Task is not a global (we're in JXA, not OmniJS)");
        }
    } catch (e) {
        console.log("    Error:", e.toString());
    }
    
    // 5. Check method binding
    console.log("\n5. Testing method binding issues:");
    
    const taskId = doc.flattenedTasks()[0].id();
    
    // Maybe the method needs proper binding?
    try {
        console.log("  Extracting method first:");
        const byIdentifier = doc.Task.byIdentifier;
        console.log("    Method extracted:", typeof byIdentifier);
        console.log("    Calling with apply:");
        const result = byIdentifier.apply(doc.Task, [taskId]);
        console.log("    Result:", result);
    } catch (e) {
        console.log("    Error:", e.toString());
    }
    
    // 6. Check if it's a namespace issue
    console.log("\n6. Checking namespace structure:");
    
    // List all properties on doc.Task
    try {
        console.log("  All doc.Task properties:");
        for (let prop in doc.Task) {
            console.log(`    ${prop}:`, typeof doc.Task[prop]);
        }
        
        // Check prototype chain
        console.log("\n  Prototype chain:");
        let proto = doc.Task;
        let depth = 0;
        while (proto && depth < 5) {
            console.log(`    Level ${depth}:`, Object.getOwnPropertyNames(proto));
            proto = Object.getPrototypeOf(proto);
            depth++;
        }
    } catch (e) {
        console.log("    Error:", e.toString());
    }
    
    // 7. Final reality check
    console.log("\n7. Reality check - what actually works:");
    console.log("  ✓ doc.flattenedTasks() - works");
    console.log("  ✓ task.id() - works"); 
    console.log("  ✓ task.name() - works");
    console.log("  ✓ doc.flattenedTasks.whose({id: X}) - works");
    console.log("  ✗ doc.Task.byIdentifier(X) - type error");
    console.log("  ✗ doc.taskWithID(X) - type error");
    console.log("\nConclusion: We're in JXA context, not OmniJS!");
}

testOmniJSvsJXA();
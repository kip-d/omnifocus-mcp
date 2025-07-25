#!/usr/bin/env osascript -l JavaScript

function testParameterTypes() {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    console.log("=== Testing Parameter Types and Formats ===\n");
    
    // Get test data
    const task = doc.flattenedTasks()[0];
    const taskId = task.id();
    const taskIdString = String(taskId);
    
    console.log("Test task ID:", taskId);
    console.log("Type of ID:", typeof taskId);
    console.log("ID constructor:", taskId.constructor.name);
    
    // Check if ID is actually a special object
    if (typeof taskId === 'object') {
        console.log("ID is an object!");
        console.log("ID properties:", Object.getOwnPropertyNames(taskId));
        console.log("ID.toString():", taskId.toString());
        console.log("ID.valueOf():", taskId.valueOf());
    }
    
    console.log("\n1. Testing different ID formats with taskWithID:");
    
    const formats = [
        { desc: "Raw ID", value: taskId },
        { desc: "String(ID)", value: String(taskId) },
        { desc: "ID.toString()", value: taskId.toString() },
        { desc: "ID.valueOf()", value: taskId.valueOf() },
        { desc: "Wrapped {id: ...}", value: {id: taskId} },
        { desc: "Array [ID]", value: [taskId] },
        { desc: "Number", value: 12345 },
        { desc: "null", value: null },
    ];
    
    formats.forEach(format => {
        try {
            console.log(`  ${format.desc}:`, format.value);
            const result = doc.taskWithID(format.value);
            console.log("    ✓ Success! Result:", result);
            if (result && result.name) {
                console.log("      Name:", result.name());
            }
        } catch (e) {
            console.log("    ✗ Error:", e.toString());
        }
    });
    
    // 2. Test with byIdentifier
    console.log("\n2. Testing with doc.Task.byIdentifier:");
    
    formats.forEach(format => {
        try {
            console.log(`  ${format.desc}:`, format.value);
            const result = doc.Task.byIdentifier(format.value);
            console.log("    ✓ Success! Result:", result);
        } catch (e) {
            console.log("    ✗ Error:", e.toString());
        }
    });
    
    // 3. Check what the methods expect
    console.log("\n3. Method signatures:");
    
    try {
        // Try to get function parameter info
        console.log("  doc.taskWithID.length (param count):", doc.taskWithID.length);
        console.log("  doc.taskWithID.name:", doc.taskWithID.name);
        
        // Try calling with no params to see error
        console.log("\n  Calling taskWithID() with no params:");
        doc.taskWithID();
    } catch (e) {
        console.log("    Error message:", e.toString());
        console.log("    (This might hint at expected parameter type)");
    }
    
    // 4. Test if it's an encoding issue
    console.log("\n4. Testing encoding/escaping:");
    
    const specialIds = [
        { desc: "URL encoded", value: encodeURIComponent(taskId) },
        { desc: "JSON stringified", value: JSON.stringify(taskId) },
        { desc: "Escaped", value: escape(taskId) },
    ];
    
    specialIds.forEach(test => {
        try {
            console.log(`  ${test.desc}: ${test.value}`);
            const result = doc.taskWithID(test.value);
            console.log("    Result:", result);
        } catch (e) {
            console.log("    Error:", e.toString());
        }
    });
    
    // 5. Compare with working whose() method
    console.log("\n5. Comparing with working whose() method:");
    
    formats.forEach(format => {
        try {
            console.log(`  whose({id: ${format.desc}}):`);
            const result = doc.flattenedTasks.whose({id: format.value});
            console.log("    Result count:", result.length);
            if (result.length > 0) {
                console.log("    ✓ Found task:", result[0].name());
            }
        } catch (e) {
            console.log("    ✗ Error:", e.toString());
        }
    });
}

testParameterTypes();
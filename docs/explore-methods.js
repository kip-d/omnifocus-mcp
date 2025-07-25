#!/usr/bin/env osascript -l JavaScript

function exploreMethods() {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    console.log("=== Exploring Methods and Properties ===\n");
    
    // Try to enumerate methods differently
    console.log("1. Document methods using try-catch:");
    const possibleDocMethods = [
        'name', 'id', 'save', 'close', 'undo', 'redo',
        'compact', 'archiveCompleted', 'flattenedTasks',
        'flattenedProjects', 'flattenedFolders', 'flattenedTags',
        'taskWithID', 'projectWithID', 'folderWithID', 'tagWithID'
    ];
    
    possibleDocMethods.forEach(method => {
        try {
            const type = typeof doc[method];
            if (type !== 'undefined') {
                console.log(`  doc.${method}: ${type}`);
                // If it's a function with special methods
                if (type === 'function' && method.includes('WithID')) {
                    console.log(`    Testing doc.${method}('test')...`);
                    try {
                        const result = doc[method]('test');
                        console.log(`    Result:`, result);
                    } catch (e) {
                        console.log(`    Error:`, e.message);
                    }
                }
            }
        } catch (e) {}
    });
    
    console.log("\n2. Task methods using a real task:");
    const tasks = doc.flattenedTasks();
    if (tasks.length > 0) {
        const task = tasks[0];
        const possibleTaskMethods = [
            'name', 'id', 'note', 'completed', 'flagged',
            'dueDate', 'deferDate', 'completionDate', 'creationDate',
            'modificationDate', 'project', 'parentTask', 'tags',
            'estimatedMinutes', 'completedByChildren', 'blocked',
            'next', 'repetitionRule', 'repetitionMethod',
            'containingProject', 'assignedContainer', 'inInbox',
            'effectiveFlagged', 'effectiveDueDate', 'effectiveDeferDate',
            'dropped', 'hasChildren', 'numberOfChildren',
            'markComplete', 'markIncomplete', 'remove', 'moveTo'
        ];
        
        console.log(`  Testing methods on task: "${task.name()}"`);
        possibleTaskMethods.forEach(method => {
            try {
                const type = typeof task[method];
                if (type !== 'undefined') {
                    console.log(`  task.${method}: ${type}`);
                }
            } catch (e) {}
        });
    }
    
    console.log("\n3. Checking for hidden enumeration:");
    // Some AppleScript objects hide their properties
    const task = tasks[0];
    try {
        // Try to force property enumeration
        console.log("  Object.keys(task):", Object.keys(task).length);
        console.log("  for...in loop:");
        let count = 0;
        for (let prop in task) {
            if (count < 5) console.log(`    ${prop}`);
            count++;
        }
        console.log(`  Total properties via for...in: ${count}`);
    } catch (e) {
        console.log("  Error:", e.message);
    }
}

exploreMethods();
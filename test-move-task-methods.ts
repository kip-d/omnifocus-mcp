/**
 * Test script to explore different ways to move existing tasks into action groups
 * Based on investigation of OmniFocus JXA API
 */

export const TEST_MOVE_METHODS_SCRIPT = `
(() => {
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();
  
  try {
    console.log("=== Testing different methods to move existing task to action group ===");
    
    // Find a test task and parent task (you'll need to modify these IDs)
    const testTaskId = "TEST_TASK_ID_HERE"; 
    const parentTaskId = "PARENT_TASK_ID_HERE";
    
    let testTask = null;
    let parentTask = null;
    
    // Find both tasks
    const allTasks = doc.flattenedTasks();
    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];
      if (task.id() === testTaskId) testTask = task;
      if (task.id() === parentTaskId) parentTask = task;
      if (testTask && parentTask) break;
    }
    
    if (!testTask || !parentTask) {
      return JSON.stringify({
        error: true,
        message: "Could not find test task or parent task. Update IDs in script."
      });
    }
    
    console.log("Found test task:", testTask.name());
    console.log("Found parent task:", parentTask.name());
    
    const results = [];
    
    // Method 1: Database.moveTasks with Task as position
    try {
      console.log("\\nTesting Method 1: doc.moveTasks([task], parentTask)");
      doc.moveTasks([testTask], parentTask);
      results.push({
        method: "doc.moveTasks([task], parentTask)",
        status: "SUCCESS",
        message: "Direct task reference worked"
      });
    } catch (e) {
      results.push({
        method: "doc.moveTasks([task], parentTask)", 
        status: "FAILED",
        error: e.toString()
      });
      console.log("Method 1 failed:", e.toString());
    }
    
    // Method 2: Database.moveTasks with Task.ChildInsertionLocation
    try {
      console.log("\\nTesting Method 2: doc.moveTasks([task], parentTask.ending)");
      doc.moveTasks([testTask], parentTask.ending);
      results.push({
        method: "doc.moveTasks([task], parentTask.ending)",
        status: "SUCCESS", 
        message: "ChildInsertionLocation worked"
      });
    } catch (e) {
      results.push({
        method: "doc.moveTasks([task], parentTask.ending)",
        status: "FAILED",
        error: e.toString()
      });
      console.log("Method 2 failed:", e.toString());
    }
    
    // Method 3: Database.moveTasks with Task.beginning
    try {
      console.log("\\nTesting Method 3: doc.moveTasks([task], parentTask.beginning)");  
      doc.moveTasks([testTask], parentTask.beginning);
      results.push({
        method: "doc.moveTasks([task], parentTask.beginning)",
        status: "SUCCESS",
        message: "ChildInsertionLocation beginning worked"
      });
    } catch (e) {
      results.push({
        method: "doc.moveTasks([task], parentTask.beginning)",
        status: "FAILED", 
        error: e.toString()
      });
      console.log("Method 3 failed:", e.toString());
    }
    
    // Method 4: assignedContainer property (current approach)
    try {
      console.log("\\nTesting Method 4: task.assignedContainer = parentTask");
      testTask.assignedContainer = parentTask;
      results.push({
        method: "task.assignedContainer = parentTask",
        status: "SUCCESS",
        message: "assignedContainer worked"
      });
    } catch (e) {
      results.push({
        method: "task.assignedContainer = parentTask",
        status: "FAILED",
        error: e.toString()
      });
      console.log("Method 4 failed:", e.toString());
    }
    
    // Method 5: Check if parent task has specific methods for adding children
    try {
      console.log("\\nTesting Method 5: parentTask.tasks.push(testTask)");
      
      // First remove task from current location if possible
      if (testTask.assignedContainer) {
        console.log("Removing from current container...");
        // This might not work but worth trying
      }
      
      parentTask.tasks.push(testTask);
      results.push({
        method: "parentTask.tasks.push(testTask)",
        status: "SUCCESS",
        message: "Direct push to parent task collection worked"
      });
    } catch (e) {
      results.push({
        method: "parentTask.tasks.push(testTask)",
        status: "FAILED",
        error: e.toString()
      });
      console.log("Method 5 failed:", e.toString());
    }
    
    // Method 6: Try recreation approach but with proper targeting
    try {
      console.log("\\nTesting Method 6: Recreation with parentTask.tasks as target");
      
      // Capture current task data
      const taskData = {
        name: testTask.name(),
        note: testTask.note() || '',
        flagged: testTask.flagged(),
        dueDate: testTask.dueDate(),
        deferDate: testTask.deferDate(),
        estimatedMinutes: testTask.estimatedMinutes()
      };
      
      // Delete original
      app.delete(testTask);
      
      // Recreate in parent
      const newTask = app.Task(taskData);
      parentTask.tasks.push(newTask);
      
      results.push({
        method: "Delete and recreate in parentTask.tasks",
        status: "SUCCESS",
        message: "Recreation approach worked",
        newTaskId: newTask.id()
      });
      
    } catch (e) {
      results.push({
        method: "Delete and recreate in parentTask.tasks", 
        status: "FAILED",
        error: e.toString()
      });
      console.log("Method 6 failed:", e.toString());
    }
    
    return JSON.stringify({
      testResults: results,
      summary: "Tested " + results.length + " methods for moving tasks to action groups"
    });
    
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Test script failed: " + error.toString()
    });
  }
})();
`;
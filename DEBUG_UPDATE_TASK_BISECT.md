# Git Bisect Test Prompt for update_task Syntax Error

## Instructions for Git Bisect
1. Start bisect: `git bisect start`
2. Mark current as bad: `git bisect bad`
3. Mark a known good commit: `git bisect good <commit-hash>`
4. At each step:
   - Run `npm install && npm run build`
   - Restart Claude Desktop
   - Run this exact prompt
   - Mark as good/bad based on results

## Test Prompt for Claude Desktop

Please run this exact test sequence to check if update_task has a syntax error when moving tasks between projects:

1. First, create a test task in the inbox:
```
Create a task named "Bisect Test Task - Move to Project" with due date tomorrow at 3pm, flagged true
```

2. List your projects to get a valid project ID:
```
List my first 5 projects with their IDs
```

3. Now attempt to move the task to a project (you'll need to use the task ID from step 1 and a project ID from step 2):
```
Update task [TASK_ID] to move it to project [PROJECT_ID]
```

## Expected Results

### GOOD (working correctly):
- Task successfully moves to the project
- Response shows the task with the new project assignment
- No errors about "Unexpected end of script"

### BAD (has the bug):
- Error message containing "Unexpected end of script"
- Error type: "SCRIPT_ERROR" or "EXECUTION_ERROR"
- Task fails to move to the project

## Additional Diagnostic Test (if error occurs)

If you get the "Unexpected end of script" error, please also try this simpler update:
```
Update task [TASK_ID] to change its name to "Renamed Task"
```

This helps determine if the issue is specific to project moves or all updates.

## Quick Copy-Paste Version

For faster testing, here's a condensed version you can copy-paste (you'll still need to substitute IDs):

```
1. Create a task "Bisect Test" due tomorrow 3pm flagged
2. List my first 5 projects  
3. Update task [TASK_ID] to project [PROJECT_ID]
```

## Notes for Bisecting

Key commits to consider:
- Known bad: Current main (v2.0.0)
- Possible good candidates:
  - Before v2.0.0 tag
  - Before evaluateJavascript changes
  - v1.x versions before major refactoring

The error specifically happens when:
- Moving a task from one project to another
- Using the evaluateJavascript bridge for moveTasks()
- Script size is around 50KB

## Automated Test Script (Alternative)

If you want to test outside Claude Desktop, save this as `test-bisect.mjs`:

```javascript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function testUpdateTask() {
  try {
    // First create a task
    const createResult = await execAsync(`node -e "
      const { CreateTaskTool } = require('./dist/tools/tasks/CreateTaskTool.js');
      const tool = new CreateTaskTool();
      tool.execute({ 
        name: 'Bisect Test Task',
        flagged: 'true',
        sequential: 'false'
      }).then(r => console.log(JSON.stringify(r)));
    "`);
    
    const createResponse = JSON.parse(createResult.stdout);
    if (!createResponse.data?.id) {
      console.log('RESULT: INCONCLUSIVE - Could not create test task');
      process.exit(125); // Skip this commit in bisect
    }
    
    const taskId = createResponse.data.id;
    
    // Get a project ID (you'll need to hardcode one)
    const projectId = 'b8eHRy9n5Ik'; // Replace with a valid project ID
    
    // Try to update/move the task
    const updateResult = await execAsync(`node -e "
      const { UpdateTaskTool } = require('./dist/tools/tasks/UpdateTaskTool.js');
      const tool = new UpdateTaskTool();
      tool.execute({
        taskId: '${taskId}',
        projectId: '${projectId}',
        name: 'Moved Task'
      }).then(r => console.log(JSON.stringify(r)));
    "`);
    
    const updateResponse = JSON.parse(updateResult.stdout);
    
    if (updateResponse.error && updateResponse.error.includes('Unexpected end of script')) {
      console.log('RESULT: BAD - Syntax error found');
      process.exit(1);
    } else if (updateResponse.data?.projectId === projectId) {
      console.log('RESULT: GOOD - Task moved successfully');
      process.exit(0);
    } else {
      console.log('RESULT: INCONCLUSIVE');
      process.exit(125);
    }
    
  } catch (error) {
    console.error('Test error:', error.message);
    process.exit(125); // Skip this commit
  }
}

testUpdateTask();
```

Then run: `git bisect run node test-bisect.mjs`
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function testIncludeStats() {
  console.log('Testing list_projects with includeStats parameter...\n');

  // Test 1: Without stats
  console.log('Test 1: Without stats (includeStats: false)');
  const script1 = `
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const projects = [];
    const allProjects = doc.flattenedProjects();
    
    for (let i = 0; i < Math.min(3, allProjects.length); i++) {
      const project = allProjects[i];
      projects.push({
        id: project.id(),
        name: project.name(),
        numberOfTasks: project.flattenedTasks().length
      });
    }
    
    JSON.stringify({ projects, includeStats: false });
  `;

  try {
    const { stdout: result1 } = await execAsync(`osascript -l JavaScript -e '${script1.replace(/'/g, "'\"'\"'")}'`);
    const data1 = JSON.parse(result1);
    console.log('Result:', JSON.stringify(data1, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }

  console.log('\n---\n');

  // Test 2: With stats
  console.log('Test 2: With stats (includeStats: true)');
  const script2 = `
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const projects = [];
    const allProjects = doc.flattenedProjects();
    
    for (let i = 0; i < Math.min(3, allProjects.length); i++) {
      const project = allProjects[i];
      const projectObj = {
        id: project.id(),
        name: project.name(),
        numberOfTasks: project.flattenedTasks().length
      };
      
      // Add stats
      const tasks = project.flattenedTasks();
      let active = 0, completed = 0, overdue = 0, flagged = 0;
      const now = new Date();
      
      for (let j = 0; j < tasks.length; j++) {
        const task = tasks[j];
        if (task.completed()) {
          completed++;
        } else {
          active++;
          const dueDate = task.dueDate();
          if (dueDate && dueDate < now) overdue++;
        }
        if (task.flagged()) flagged++;
      }
      
      projectObj.stats = {
        active,
        completed,
        total: tasks.length,
        completionRate: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
        overdue,
        flagged
      };
      
      projects.push(projectObj);
    }
    
    JSON.stringify({ projects, includeStats: true });
  `;

  try {
    const { stdout: result2 } = await execAsync(`osascript -l JavaScript -e '${script2.replace(/'/g, "'\"'\"'")}'`);
    const data2 = JSON.parse(result2);
    console.log('Result:', JSON.stringify(data2, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testIncludeStats().catch(console.error);

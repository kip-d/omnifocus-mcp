import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, '../../dist/index.js');

interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: {
    content: Array<{
      type: string;
      text: string;
    }>;
  };
  error?: {
    code: number;
    message: string;
  };
}

async function testDateRangeQueries() {
  console.log('Testing date range query tools...\n');

  const proc = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let output = '';
  proc.stdout.on('data', (data) => {
    output += data.toString();
  });

  proc.stderr.on('data', (data) => {
    console.error('STDERR:', data.toString());
  });

  // Send initialization
  const initRequest = {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      clientInfo: { name: 'test-client', version: '1.0.0' },
      capabilities: {},
    },
    id: 1,
  };

  proc.stdin.write(JSON.stringify(initRequest) + '\n');

  // Wait for initialization
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Test cases
  const tests = [
    {
      name: 'Get overdue tasks',
      tool: 'get_overdue_tasks',
      params: {
        limit: 10,
      },
    },
    {
      name: 'Get upcoming tasks (next 7 days)',
      tool: 'get_upcoming_tasks',
      params: {
        days: 7,
        includeToday: true,
        limit: 10,
      },
    },
    {
      name: 'Query tasks due this week',
      tool: 'query_tasks_by_date',
      params: {
        queryType: 'date_range',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        dateField: 'dueDate',
        limit: 10,
      },
    },
    {
      name: 'Query deferred tasks becoming available this week',
      tool: 'query_tasks_by_date',
      params: {
        queryType: 'date_range',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        dateField: 'deferDate',
        limit: 10,
      },
    },
  ];

  for (const test of tests) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Test: ${test.name}`);
    console.log(`Tool: ${test.tool}`);
    console.log('Parameters:', JSON.stringify(test.params, null, 2));
    console.log('='.repeat(60));

    const request = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: test.tool,
        arguments: test.params,
      },
      id: tests.indexOf(test) + 2,
    };

    output = '';
    proc.stdin.write(JSON.stringify(request) + '\n');

    // Wait for response
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Parse response
    const lines = output.split('\n').filter((line) => line.trim());
    const lastLine = lines[lines.length - 1];

    if (lastLine) {
      try {
        const response: MCPResponse = JSON.parse(lastLine);

        if (response.error) {
          console.log('❌ Error:', response.error.message);
        } else if (response.result?.content) {
          const content = response.result.content[0];
          if (content.type === 'text') {
            const data = JSON.parse(content.text);

            if (data.error) {
              console.log('❌ Script Error:', data.message);
              if (data.details) console.log('Details:', data.details);
            } else {
              console.log('✓ Success!');
              const tasks = data.data?.items || data.tasks || [];
              console.log(`Found ${tasks.length} tasks`);

              const summary = data.metadata?.summary || data.summary;
              if (summary) {
                console.log('\nSummary:');
                console.log('- Query time:', summary.query_time_ms + 'ms');
                if (summary.query_method) {
                  console.log('- Query method:', summary.query_method);
                }
                if (summary.limited) {
                  console.log('- Results limited to:', summary.limited);
                }
              }

              if (tasks.length > 0) {
                console.log('\nFirst few tasks:');
                tasks.slice(0, 3).forEach((task: any, i: number) => {
                  console.log(`${i + 1}. ${task.name}`);
                  if (task.dueDate) console.log(`   Due: ${new Date(task.dueDate).toLocaleDateString()}`);
                  if (task.deferDate) console.log(`   Defer: ${new Date(task.deferDate).toLocaleDateString()}`);
                  if (task.project) console.log(`   Project: ${task.project}`);
                  if (task.daysOverdue !== undefined) console.log(`   Days overdue: ${task.daysOverdue}`);
                  if (task.daysUntilDue !== undefined) console.log(`   Days until due: ${task.daysUntilDue}`);
                });
              }
            }
          }
        }
      } catch (e) {
        console.log('Failed to parse response:', e);
        console.log('Raw output:', lastLine);
      }
    }
  }

  proc.kill();
  process.exit(0);
}

testDateRangeQueries().catch(console.error);

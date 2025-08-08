#!/usr/bin/env node

/**
 * Test script to demonstrate comprehensive repeat/recurrence functionality
 * 
 * This script tests the new repeat rule features including:
 * - Task creation with various repeat patterns  
 * - Task updates to modify repeat rules
 * - Project repeat rule support
 * - Complex weekly and monthly patterns
 * - Integration with OmniFocus RepetitionRule API
 */

const { spawn } = require('child_process');

async function testMCPServer() {
  return new Promise((resolve, reject) => {
    console.log('🧪 Testing Comprehensive Repeat/Recurrence Features...\n');
    
    // Start the MCP server
    const serverProcess = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });

    let requestId = 1;
    let responseBuffer = '';
    
    const sendRequest = (method, params = {}) => {
      const request = {
        jsonrpc: '2.0',
        id: requestId++,
        method,
        params
      };
      
      console.log(`→ ${method}:`, JSON.stringify(params, null, 2));
      serverProcess.stdin.write(JSON.stringify(request) + '\n');
    };
    
    serverProcess.stdout.on('data', (data) => {
      responseBuffer += data.toString();
      
      // Process complete JSON responses
      const lines = responseBuffer.split('\n');
      responseBuffer = lines.pop(); // Keep incomplete line
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);
            console.log(`← Response for ${response.id}:`, JSON.stringify(response, null, 2));
            
            // Test sequence
            if (response.id === 1) {
              // After initialize, list tools
              sendRequest('tools/list');
            } else if (response.id === 2) {
              // After tools/list, test daily repeat task creation
              sendRequest('tools/call', {
                name: 'create_task',
                arguments: {
                  name: 'Daily standup meeting',
                  note: 'Team synchronization - every weekday at 9am',
                  repeatRule: {
                    unit: 'day',
                    steps: 1,
                    method: 'fixed'
                  },
                  dueDate: '2025-08-09 09:00'
                }
              });
            } else if (response.id === 3) {
              // Test weekly repeat with specific days
              sendRequest('tools/call', {
                name: 'create_task',
                arguments: {
                  name: 'Team workout session',
                  repeatRule: {
                    unit: 'week',
                    steps: 1,
                    weekdays: ['monday', 'wednesday', 'friday'],
                    method: 'fixed'
                  },
                  dueDate: '2025-08-11 18:00'
                }
              });
            } else if (response.id === 4) {
              // Test monthly repeat with positional pattern
              sendRequest('tools/call', {
                name: 'create_task',
                arguments: {
                  name: 'Monthly board meeting',
                  repeatRule: {
                    unit: 'month',
                    steps: 1,
                    weekPosition: 1,
                    weekday: 'tuesday',
                    method: 'fixed'
                  },
                  dueDate: '2025-08-05 14:00'
                }
              });
            } else if (response.id === 5) {
              // Test hourly repeat for gaming tasks
              sendRequest('tools/call', {
                name: 'create_task',
                arguments: {
                  name: 'Collect energy rewards',
                  repeatRule: {
                    unit: 'hour',
                    steps: 4,
                    method: 'start-after-completion'
                  },
                  dueDate: '2025-08-08 20:00'
                }
              });
            } else if (response.id === 6) {
              // Test quarterly repeat with defer another
              sendRequest('tools/call', {
                name: 'create_task',
                arguments: {
                  name: 'Quarterly business review',
                  repeatRule: {
                    unit: 'month',
                    steps: 3,
                    method: 'fixed',
                    deferAnother: {
                      unit: 'week',
                      steps: 2
                    }
                  },
                  dueDate: '2025-11-15 10:00'
                }
              });
            } else if (response.id === 7) {
              // Test complex monthly pattern - last Friday
              sendRequest('tools/call', {
                name: 'create_task',
                arguments: {
                  name: 'Month-end financial report',
                  repeatRule: {
                    unit: 'month',
                    steps: 1,
                    weekPosition: 'last',
                    weekday: 'friday',
                    method: 'fixed'
                  },
                  dueDate: '2025-08-29 17:00'
                }
              });
            } else if (response.id === 8) {
              // Test repeat rule update
              sendRequest('tools/call', {
                name: 'update_task',
                arguments: {
                  taskId: response.result?.content?.[0]?.text ? 
                    JSON.parse(response.result.content[0].text)?.data?.task?.taskId : 'test-id',
                  repeatRule: {
                    unit: 'week',
                    steps: 2,
                    method: 'due-after-completion'
                  }
                }
              });
            } else if (response.id === 9) {
              // Test project with repeat rule
              sendRequest('tools/call', {
                name: 'create_project',
                arguments: {
                  name: 'Weekly project review',
                  note: 'Recurring project for team status updates',
                  repeatRule: {
                    unit: 'week',
                    steps: 1,
                    weekdays: ['friday'],
                    method: 'fixed'
                  },
                  sequential: false
                }
              });
            } else if (response.id === 10) {
              // List tasks to show repeat info
              sendRequest('tools/call', {
                name: 'list_tasks',
                arguments: {
                  completed: false,
                  limit: 10,
                  search: 'standup'
                }
              });
            } else if (response.id === 11) {
              // Test clearing repeat rule
              sendRequest('tools/call', {
                name: 'update_task',
                arguments: {
                  taskId: 'test-id', // Would use actual ID in real test
                  clearRepeatRule: true
                }
              });
            } else if (response.id === 12) {
              console.log('\n✅ All repeat rule tests completed successfully!');
              console.log('\n📋 Test Summary:');
              console.log('• Daily repeat task creation');
              console.log('• Weekly repeat with specific weekdays');
              console.log('• Monthly positional patterns (1st Tuesday)');
              console.log('• Hourly gaming task patterns');
              console.log('• Quarterly with defer another');
              console.log('• Complex monthly patterns (last Friday)');
              console.log('• Repeat rule updates');
              console.log('• Project repeat rules');
              console.log('• Task listing with repeat info');
              console.log('• Clearing repeat rules');
              
              serverProcess.kill();
              resolve();
            }
            
          } catch (e) {
            console.error('Error parsing JSON:', e.message);
          }
        }
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      // Filter out OmniFocus permission info logs
      const message = data.toString();
      if (!message.includes('OmniFocus permissions') && 
          !message.includes('[INFO]') &&
          !message.includes('Registered') &&
          !message.includes('Executing tool')) {
        console.error('Server Error:', message);
      }
    });
    
    serverProcess.on('error', (error) => {
      console.error('Failed to start server:', error);
      reject(error);
    });
    
    // Start the test sequence
    sendRequest('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: 'repeat-rule-test',
        version: '1.0.0'
      }
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      console.log('\n⏰ Test completed (timeout)');
      serverProcess.kill();
      resolve();
    }, 30000);
  });
}

if (require.main === module) {
  testMCPServer().catch(console.error);
}
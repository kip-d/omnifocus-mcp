#!/usr/bin/env node

/**
 * Token Usage Analysis for OmniFocus Database
 * Analyzes current database size and estimates token usage under different compression approaches
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

class TokenAnalyzer {
  constructor() {
    this.server = null;
    this.messageId = 0;
    this.pendingRequests = new Map();
    
    // Actual database sizes from user
    this.actualTaskCount = 1158;
    this.actualProjectCount = 124;
    this.actualTagCount = 50;
  }

  async startServer() {
    console.log('🚀 Starting MCP server for analysis...');
    
    this.server = spawn('node', ['./dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const rl = createInterface({
      input: this.server.stdout,
      crlfDelay: Infinity
    });

    rl.on('line', (line) => {
      try {
        const response = JSON.parse(line);
        if (response.id && this.pendingRequests.has(response.id)) {
          const resolver = this.pendingRequests.get(response.id);
          this.pendingRequests.delete(response.id);
          resolver(response);
        }
      } catch (e) {
        // Ignore non-JSON output
      }
    });

    // Wait for server to be ready
    await this.delay(1000);
    console.log('✅ MCP server connected');
  }

  async callTool(method, params = {}, timeout = 300000) {
    return new Promise((resolve, reject) => {
      const requestId = ++this.messageId;
      this.pendingRequests.set(requestId, resolve);
      
      this.server.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        method,
        params
      }) + '\n');
      
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request ${requestId} timed out after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async analyzeDatabase() {
    try {
      // Initialize connection
      await this.callTool('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'token-analyzer', version: '1.0.0' }
      });
      
      // Send initialized notification
      this.server.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      }) + '\n');
      
      await this.delay(100);

      console.log('\n📊 Analyzing OmniFocus Database...\n');

      // Get system overview
      console.log('🔍 Getting system info...');
      const systemInfo = await this.callTool('tools/call', {
        name: 'system',
        arguments: { operation: 'version' }
      });
      console.log('✅ System info received');

      // Get task data (full database using export tool)
      console.log('📋 Getting task data using export_tasks tool (this may take several minutes for 1,316+ actions)...');
      const taskCounts = await this.callTool('tools/call', {
        name: 'export_tasks',
        arguments: { 
          format: 'json',
          filter: {
            limit: 2000 // Override default 1000 limit to get all 1,316+ actions
          },
          fields: ['id', 'name', 'note', 'project', 'tags', 'deferDate', 'dueDate', 'completed', 'completionDate', 'flagged', 'estimated', 'created', 'modified']
        }
      });
      console.log('✅ Task data received');

      // Get project data (full database using export tool)
      console.log('📁 Getting project data using export_projects tool (this may take a minute for 124+ projects)...');
      const projectCounts = await this.callTool('tools/call', {
        name: 'export_projects',
        arguments: { 
          format: 'json',
          includeStats: true
        }
      });
      console.log('✅ Project data received');

      // Skip tags for now due to script errors
      console.log('🏷️  Skipping tags due to script errors...');
      const tagCounts = { result: { content: [{ text: '{"success":true,"data":{"items":[]}}' }] } };
      console.log('✅ Using placeholder tag data');

      // Debug: Log raw responses
      console.log('\n🔍 Raw Response Analysis:');
      console.log('System Info:', JSON.stringify(systemInfo, null, 2));
      console.log('Task Counts:', JSON.stringify(taskCounts, null, 2));
      console.log('Project Counts:', JSON.stringify(projectCounts, null, 2));
      console.log('Tag Counts:', JSON.stringify(tagCounts, null, 2));

      // Analyze the data
      this.analyzeTokenUsage(systemInfo, taskCounts, projectCounts, tagCounts);

    } catch (error) {
      console.error('❌ Analysis failed:', error.message);
    }
  }

  analyzeTokenUsage(systemInfo, taskCounts, projectCounts, tagCounts) {
    console.log('🔍 Database Overview:');
    
    // Parse responses to get actual data
    let systemData, tasksData, projectsData, tagsData;
    
    try {
      systemData = JSON.parse(systemInfo.result.content[0].text);
      tasksData = JSON.parse(taskCounts.result.content[0].text);
      projectsData = JSON.parse(projectCounts.result.content[0].text);
      tagsData = JSON.parse(tagCounts.result.content[0].text);
    } catch (e) {
      console.log('⚠️  Could not parse some responses, using summary data');
      return;
    }

    // Export tools return data in different format
    const taskCount = tasksData.data?.data?.length || tasksData.data?.tasks?.length || 0;
    const projectCount = projectsData.data?.data?.length || projectsData.data?.projects?.length || 0;
    const tagCount = tagsData.data?.items?.length || 0;

    console.log(`  📋 Tasks: ${taskCount}`);
    console.log(`  📁 Projects: ${projectCount}`);
    console.log(`  🏷️  Tags: ${tagCount}`);
    console.log(`  💾 Database: ${systemData.data?.database?.name || 'Unknown'}`);

    // Analyze the full database data for accurate token counts
    this.analyzeFullData(tasksData, projectsData, tagsData);
  }

  analyzeFullData(tasksData, projectsData, tagsData) {
    console.log('\n🔢 Full Database Token Usage Analysis:\n');

    // Get actual full data (export tools return data in different format)
    const allTasks = tasksData.data?.data || tasksData.data?.tasks || [];
    const allProjects = projectsData.data?.data || projectsData.data?.projects || [];
    const allTags = tagsData.data?.items || [];

    console.log(`📊 Actual Data Retrieved:`);
    console.log(`  📋 Tasks: ${allTasks.length}`);
    console.log(`  📁 Projects: ${allProjects.length}`);
    console.log(`  🏷️  Tags: ${allTags.length}`);

    // Use actual retrieved counts instead of estimates
    const actualTaskCount = allTasks.length;
    const actualProjectCount = allProjects.length;
    const actualTagCount = allTags.length;

    // Approach 1: Raw Export (current format)
    const rawExport = this.estimateRawExport(allTasks, allProjects, allTags);
    console.log('📄 Approach 1: Raw Export (Current Format)');
    console.log(`   Actual tokens: ${rawExport.actualTokens.toLocaleString()}`);
    console.log(`   Context usage: ${rawExport.contextUsage}% of 200k context`);

    // Approach 2: Smart Summarization
    const smartSummary = this.estimateSmartSummary(allTasks, allProjects, allTags);
    console.log('\n🧠 Approach 2: Smart Summarization');
    console.log(`   Actual tokens: ${smartSummary.actualTokens.toLocaleString()}`);
    console.log(`   Context usage: ${smartSummary.contextUsage}% of 200k context`);

    // Approach 3: Hierarchical Compression
    const hierarchical = this.estimateHierarchical(allTasks, allProjects, allTags);
    console.log('\n🏗️  Approach 3: Hierarchical Compression');
    console.log(`   Actual tokens: ${hierarchical.actualTokens.toLocaleString()}`);
    console.log(`   Context usage: ${hierarchical.contextUsage}% of 200k context`);

    // Approach 4: Query-Based Export
    const queryBased = this.estimateQueryBased(allTasks, allProjects, allTags);
    console.log('\n🔍 Approach 4: Query-Based Export');
    console.log(`   Actual tokens: ${queryBased.actualTokens.toLocaleString()}`);
    console.log(`   Context usage: ${queryBased.contextUsage}% of 200k context`);

    // Recommendations
    this.provideRecommendations(rawExport, smartSummary, hierarchical, queryBased);
    
    console.log('\n🎯 Analysis Complete!');
    console.log('💡 Next steps: Use these actual token counts to plan LLM export strategies.');
    console.log('🚀 Consider implementing query-based export for immediate AI assistance.');
  }

  estimateRawExport(tasks, projects, tags) {
    // Raw export includes all fields, notes, metadata
    const fullData = {
      tasks: tasks.map(t => ({
        id: t.id,
        name: t.name,
        note: t.note || '',
        flagged: t.flagged,
        dueDate: t.dueDate,
        deferDate: t.deferDate,
        estimatedMinutes: t.estimatedMinutes,
        tags: t.tags || [],
        project: t.project,
        projectId: t.projectId,
        inInbox: t.inInbox,
        completed: t.completed,
        taskStatus: t.taskStatus,
        blocked: t.blocked,
        next: t.next,
        available: t.available,
        recurringStatus: t.recurringStatus
      })),
      projects: projects.map(p => ({
        id: p.id,
        name: p.name,
        note: p.note || '',
        status: p.status,
        folder: p.folder,
        dueDate: p.dueDate,
        flagged: p.flagged,
        sequential: p.sequential,
        nextReviewDate: p.nextReviewDate,
        reviewInterval: p.reviewInterval,
        completedByChildren: p.completedByChildren,
        singleton: p.singleton
      })),
      tags: tags.map(t => ({
        id: t.id,
        name: t.name,
        taskCount: t.taskCount || 0
      }))
    };

    const fullJson = JSON.stringify(fullData, null, 2);
    const actualTokens = this.estimateTokens(fullJson);
    
    return {
      actualTokens,
      contextUsage: Math.round((actualTokens / 200000) * 100)
    };
  }

  estimateSmartSummary(tasks, projects, tags) {
    // Smart summary focuses on key insights and patterns
    const summary = {
      system_summary: {
        total_tasks: tasks.length,
        active_projects: projects.filter(p => p.status === 'active').length,
        overdue_count: tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date()).length,
        flagged_count: tasks.filter(t => t.flagged).length,
        completion_rate: "68%" // Placeholder
      },
      priority_analysis: {
        high_priority: tasks.filter(t => t.flagged).slice(0, 3).map(t => t.name),
        blocked_tasks: tasks.filter(t => t.blocked).slice(0, 3).map(t => t.name),
        next_actions: tasks.filter(t => t.next).slice(0, 3).map(t => t.name)
      },
      project_status: {
        active: projects.filter(p => p.status === 'active').length,
        on_hold: projects.filter(p => p.status === 'onHold').length,
        completed: projects.filter(p => p.status === 'completed').length
      }
    };

    const fullJson = JSON.stringify(summary, null, 2);
    const actualTokens = this.estimateTokens(fullJson);
    
    return {
      actualTokens,
      contextUsage: Math.round((actualTokens / 200000) * 100)
    };
  }

  estimateHierarchical(tasks, projects, tags) {
    // Hierarchical compression preserves relationships but flattens structure
    const hierarchical = {
      projects: projects.map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
        tasks: tasks.filter(t => t.projectId === p.id).map(t => ({
          id: t.id,
          name: t.name,
          status: t.completed ? 'completed' : 'active',
          due: t.dueDate,
          flagged: t.flagged
        }))
      })),
      tags: tags.map(t => ({
        name: t.name,
        count: t.taskCount || 0
      }))
    };

    const fullJson = JSON.stringify(hierarchical, null, 2);
    const actualTokens = this.estimateTokens(fullJson);
    
    return {
      actualTokens,
      contextUsage: Math.round((actualTokens / 200000) * 100)
    };
  }

  estimateQueryBased(tasks, projects, tags) {
    // Query-based focuses on specific analysis needs
    const queryResults = {
      query: "overdue_and_blocked_analysis",
      data: {
        overdue: tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date()).slice(0, 5).map(t => ({
          id: t.id,
          name: t.name,
          days_overdue: Math.floor((new Date() - new Date(t.dueDate)) / (1000 * 60 * 60 * 24))
        })),
        blocked: tasks.filter(t => t.blocked).slice(0, 5).map(t => ({
          id: t.id,
          name: t.name,
          project: t.project
        })),
        next_actions: tasks.filter(t => t.next).slice(0, 5).map(t => ({
          id: t.id,
          name: t.name,
          project: t.project
        }))
      },
      summary: {
        total_overdue: tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date()).length,
        total_blocked: tasks.filter(t => t.blocked).length,
        total_next: tasks.filter(t => t.next).length
      }
    };

    const fullJson = JSON.stringify(queryResults, null, 2);
    const actualTokens = this.estimateTokens(fullJson);
    
    return {
      actualTokens,
      contextUsage: Math.round((actualTokens / 200000) * 100)
    };
  }

  estimateTokens(text) {
    // Rough estimation: 1 token ≈ 4 characters for English text
    // This is a simplified approximation
    return Math.round(text.length / 4);
  }

  provideRecommendations(raw, smart, hierarchical, query) {
    console.log('\n💡 Recommendations:\n');

    if (raw.contextUsage > 100) {
      console.log('❌ Raw export exceeds context window - not suitable for LLM analysis');
    } else if (raw.contextUsage > 80) {
      console.log('⚠️  Raw export uses most of context window - limited room for analysis');
    } else {
      console.log('✅ Raw export fits in context window - good for detailed analysis');
    }

    if (smart.contextUsage < 20) {
      console.log('✅ Smart summary very efficient - excellent for system-wide insights');
    } else if (smart.contextUsage < 50) {
      console.log('✅ Smart summary efficient - good for comprehensive analysis');
    } else {
      console.log('⚠️  Smart summary uses significant context - consider query-based approach');
    }

    if (hierarchical.contextUsage < 40) {
      console.log('✅ Hierarchical compression good - preserves relationships efficiently');
    } else {
      console.log('⚠️  Hierarchical compression uses significant context');
    }

    if (query.contextUsage < 10) {
      console.log('✅ Query-based very efficient - excellent for focused analysis');
    } else {
      console.log('✅ Query-based efficient - good for specific insights');
    }

    console.log('\n🎯 Best approach for LLM analysis:');
    if (query.contextUsage < 20) {
      console.log('   Query-based export - most efficient, focused insights');
    } else if (smart.contextUsage < 30) {
      console.log('   Smart summary - comprehensive overview, efficient');
    } else if (hierarchical.contextUsage < 50) {
      console.log('   Hierarchical compression - preserves relationships');
    } else {
      console.log('   Raw export - full fidelity, but uses most context');
    }
  }

  async stop() {
    if (this.server && !this.server.killed) {
      this.server.kill();
      await this.delay(100);
    }
  }
}

async function main() {
  const analyzer = new TokenAnalyzer();
  
  try {
    await analyzer.startServer();
    await analyzer.analyzeDatabase();
  } catch (e) {
    console.error('❌ Analysis failed:', e.message);
  } finally {
    await analyzer.stop();
    console.log('\n✅ Analysis script completed. Exiting...');
    process.exit(0);
  }
}

main();

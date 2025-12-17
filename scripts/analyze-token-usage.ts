#!/usr/bin/env node

/**
 * Token Usage Analysis for OmniFocus Database
 * Analyzes current database size and estimates token usage under different compression approaches
 */

import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';

interface MCPResponse {
  id?: number;
  result?: {
    content: Array<{
      type: string;
      text: string;
    }>;
  };
  jsonrpc: string;
}

interface TokenEstimate {
  tokens: number;
  chars: number;
  kilobytes: string;
}

interface EstimateResult {
  actualTokens: number;
  chars: number;
  kilobytes: string;
  contextUsage: number;
}

interface NoteItem {
  type: 'task' | 'project';
  id: string;
  name: string;
  noteLength: number;
  tokens: number;
}

interface Task {
  id: string;
  name: string;
  note?: string;
  flagged?: boolean;
  dueDate?: string;
  deferDate?: string;
  estimatedMinutes?: number;
  tags?: string[];
  project?: string;
  projectId?: string;
  inInbox?: boolean;
  completed?: boolean;
  taskStatus?: string;
  blocked?: boolean;
  next?: boolean;
  available?: boolean;
  recurringStatus?: string;
}

interface Project {
  id: string;
  name: string;
  note?: string;
  status?: string;
  folder?: string;
  dueDate?: string;
  flagged?: boolean;
  sequential?: boolean;
  nextReviewDate?: string;
  reviewInterval?: number;
  completedByChildren?: boolean;
  singleton?: boolean;
}

interface Tag {
  id: string;
  name: string;
  parentId?: string;
  parentName?: string;
}

class TokenAnalyzer {
  private server: ChildProcess | null = null;
  private messageId: number = 0;
  private pendingRequests: Map<number, (value: MCPResponse) => void> = new Map();

  // Actual database sizes from user
  private actualTaskCount: number = 1158;
  private actualProjectCount: number = 124;
  private actualTagCount: number = 50;

  async startServer(): Promise<void> {
    console.log('🚀 Starting MCP server for analysis...');

    this.server = spawn('node', ['./dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const rl = createInterface({
      input: this.server.stdout,
      crlfDelay: Infinity,
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

  async callTool(method: string, params: any = {}, timeout: number = 300000): Promise<MCPResponse> {
    return new Promise((resolve, reject) => {
      const requestId = ++this.messageId;
      this.pendingRequests.set(requestId, resolve);

      this.server.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          method,
          params,
        }) + '\n',
      );

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request ${requestId} timed out after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async analyzeDatabase(): Promise<void> {
    try {
      // Initialize connection
      await this.callTool('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'token-analyzer', version: '1.0.0' },
      });

      // Send initialized notification
      this.server.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        }) + '\n',
      );

      await this.delay(100);

      console.log('\n📊 Analyzing OmniFocus Database...\n');

      // Get system overview
      console.log('🔍 Getting system info...');
      const systemInfo = await this.callTool('tools/call', {
        name: 'system',
        arguments: { operation: 'version' },
      });
      console.log('✅ System info received');

      // Get task data (full database using export tool)
      console.log('📋 Getting task data using export tool (this may take several minutes for 1,500+ actions)...');
      const taskCounts = await this.callTool('tools/call', {
        name: 'export',
        arguments: {
          type: 'tasks',
          format: 'json',
          filter: {
            limit: 2000, // Override default 1000 limit to get all actions
          },
          fields: [
            'id',
            'name',
            'note',
            'project',
            'tags',
            'deferDate',
            'dueDate',
            'completed',
            'completionDate',
            'flagged',
            'estimated',
            'created',
            'modified',
          ],
        },
      });
      console.log('✅ Task data received');

      // Get project data (full database using export tool)
      console.log('📁 Getting project data using export tool (this may take a minute for 130+ projects)...');
      const projectCounts = await this.callTool('tools/call', {
        name: 'export',
        arguments: {
          type: 'projects',
          format: 'json',
          includeStats: true,
        },
      });
      console.log('✅ Project data received');

      // Get tag data
      console.log('🏷️  Getting tag data...');
      const tagCounts = await this.callTool('tools/call', {
        name: 'tags',
        arguments: {
          operation: 'list',
          sortBy: 'name',
          includeEmpty: 'true',
          includeUsageStats: 'false',
          includeTaskCounts: 'true',
          fastMode: 'false',
          namesOnly: 'false',
        },
      });
      console.log('✅ Tag data received');

      // Debug: Log raw responses (commented out - too verbose)
      // console.log('\n🔍 Raw Response Analysis:');
      // console.log('System Info:', JSON.stringify(systemInfo, null, 2));
      // console.log('Task Counts:', JSON.stringify(taskCounts, null, 2));
      // console.log('Project Counts:', JSON.stringify(projectCounts, null, 2));
      // console.log('Tag Counts:', JSON.stringify(tagCounts, null, 2));

      // Analyze the data
      this.analyzeTokenUsage(systemInfo, taskCounts, projectCounts, tagCounts);
    } catch (error) {
      console.error('❌ Analysis failed:', error.message);
    }
  }

  analyzeTokenUsage(
    systemInfo: MCPResponse,
    taskCounts: MCPResponse,
    projectCounts: MCPResponse,
    tagCounts: MCPResponse,
  ): void {
    console.log('🔍 Database Overview:');

    // Parse responses to get actual data
    let systemData, tasksData, projectsData, tagsData;

    try {
      systemData = JSON.parse(systemInfo.result.content[0].text);
      tasksData = JSON.parse(taskCounts.result.content[0].text);
      projectsData = JSON.parse(projectCounts.result.content[0].text);
      tagsData = JSON.parse(tagCounts.result.content[0].text);
    } catch (e) {
      console.log('⚠️  Could not parse some responses:', e.message);
      console.log('\nDEBUG - systemInfo type:', typeof systemInfo);
      console.log('DEBUG - taskCounts type:', typeof taskCounts);
      console.log('DEBUG - projectCounts type:', typeof projectCounts);
      return;
    }

    // NEW FORMAT: Export tools now return { success: true, data: { format, data, count, duration } }
    const taskArray = tasksData.data?.data || [];
    const projectArray = projectsData.data?.data || [];
    const tagArray = tagsData.data?.items || [];

    console.log(`  📋 Tasks: ${taskArray.length} (${tasksData.data?.count || 'unknown'} total)`);
    console.log(`  📁 Projects: ${projectArray.length}`);
    console.log(`  🏷️  Tags: ${tagArray.length}`);
    console.log(`  💾 Server: ${systemData.data?.name || 'Unknown'} v${systemData.data?.version || '?'}`);

    if (tasksData.data?.duration) {
      console.log(`  ⏱️  Task export took: ${tasksData.data.duration}ms`);
    }
    if (projectsData.data?.duration) {
      console.log(`  ⏱️  Project export took: ${projectsData.data.duration}ms`);
    }

    // Analyze the full database data for accurate token counts
    this.analyzeFullData(tasksData, projectsData, tagsData);
  }

  analyzeFullData(tasksData: any, projectsData: any, tagsData: any): void {
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
    console.log(`   Tokens: ${rawExport.actualTokens.toLocaleString()}`);
    console.log(`   Size: ${rawExport.kilobytes} KB (${rawExport.chars.toLocaleString()} chars)`);
    console.log(`   Context: ${rawExport.contextUsage}% of 200k window`);

    // Approach 2: Smart Summarization
    const smartSummary = this.estimateSmartSummary(allTasks, allProjects, allTags);
    console.log('\n🧠 Approach 2: Smart Summarization');
    console.log(`   Tokens: ${smartSummary.actualTokens.toLocaleString()}`);
    console.log(`   Size: ${smartSummary.kilobytes} KB (${smartSummary.chars.toLocaleString()} chars)`);
    console.log(`   Context: ${smartSummary.contextUsage}% of 200k window`);

    // Approach 3: Hierarchical Compression
    const hierarchical = this.estimateHierarchical(allTasks, allProjects, allTags);
    console.log('\n🏗️  Approach 3: Hierarchical Compression');
    console.log(`   Tokens: ${hierarchical.actualTokens.toLocaleString()}`);
    console.log(`   Size: ${hierarchical.kilobytes} KB (${hierarchical.chars.toLocaleString()} chars)`);
    console.log(`   Context: ${hierarchical.contextUsage}% of 200k window`);

    // Approach 4: Query-Based Export
    const queryBased = this.estimateQueryBased(allTasks, allProjects, allTags);
    console.log('\n🔍 Approach 4: Query-Based Export');
    console.log(`   Tokens: ${queryBased.actualTokens.toLocaleString()}`);
    console.log(`   Size: ${queryBased.kilobytes} KB (${queryBased.chars.toLocaleString()} chars)`);
    console.log(`   Context: ${queryBased.contextUsage}% of 200k window`);

    // Note size analysis
    this.analyzeNoteSizes(allTasks, allProjects);

    // Recommendations
    this.provideRecommendations(rawExport, smartSummary, hierarchical, queryBased);

    console.log('\n🎯 Analysis Complete!');
    console.log('💡 Next steps: Use these actual token counts to plan LLM export strategies.');
    console.log('🚀 Consider implementing query-based export for immediate AI assistance.');
  }

  estimateRawExport(tasks: Task[], projects: Project[], tags: Tag[]): EstimateResult {
    // Raw export includes all fields, notes, metadata
    const fullData = {
      tasks: tasks.map((t) => ({
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
        recurringStatus: t.recurringStatus,
      })),
      projects: projects.map((p) => ({
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
        singleton: p.singleton,
      })),
      tags: tags.map((t) => ({
        id: t.id,
        name: t.name,
        taskCount: t.taskCount || 0,
      })),
    };

    const fullJson = JSON.stringify(fullData, null, 2);
    const estimate = this.estimateTokens(fullJson);

    return {
      actualTokens: estimate.tokens,
      chars: estimate.chars,
      kilobytes: estimate.kilobytes,
      contextUsage: Math.round((estimate.tokens / 200000) * 100),
    };
  }

  estimateSmartSummary(tasks: Task[], projects: Project[], tags: Tag[]): EstimateResult {
    // Smart summary focuses on key insights and patterns
    const summary = {
      system_summary: {
        total_tasks: tasks.length,
        active_projects: projects.filter((p) => p.status === 'active').length,
        overdue_count: tasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date()).length,
        flagged_count: tasks.filter((t) => t.flagged).length,
        completion_rate: '68%', // Placeholder
      },
      priority_analysis: {
        high_priority: tasks
          .filter((t) => t.flagged)
          .slice(0, 3)
          .map((t) => t.name),
        blocked_tasks: tasks
          .filter((t) => t.blocked)
          .slice(0, 3)
          .map((t) => t.name),
        next_actions: tasks
          .filter((t) => t.next)
          .slice(0, 3)
          .map((t) => t.name),
      },
      project_status: {
        active: projects.filter((p) => p.status === 'active').length,
        on_hold: projects.filter((p) => p.status === 'onHold').length,
        completed: projects.filter((p) => p.status === 'completed').length,
      },
    };

    const fullJson = JSON.stringify(summary, null, 2);
    const estimate = this.estimateTokens(fullJson);

    return {
      actualTokens: estimate.tokens,
      chars: estimate.chars,
      kilobytes: estimate.kilobytes,
      contextUsage: Math.round((estimate.tokens / 200000) * 100),
    };
  }

  estimateHierarchical(tasks: Task[], projects: Project[], tags: Tag[]): EstimateResult {
    // Hierarchical compression preserves relationships but flattens structure
    const hierarchical = {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        tasks: tasks
          .filter((t) => t.projectId === p.id)
          .map((t) => ({
            id: t.id,
            name: t.name,
            status: t.completed ? 'completed' : 'active',
            due: t.dueDate,
            flagged: t.flagged,
          })),
      })),
      tags: tags.map((t) => ({
        name: t.name,
        count: t.taskCount || 0,
      })),
    };

    const fullJson = JSON.stringify(hierarchical, null, 2);
    const estimate = this.estimateTokens(fullJson);

    return {
      actualTokens: estimate.tokens,
      chars: estimate.chars,
      kilobytes: estimate.kilobytes,
      contextUsage: Math.round((estimate.tokens / 200000) * 100),
    };
  }

  estimateQueryBased(tasks: Task[], projects: Project[], tags: Tag[]): EstimateResult {
    // Query-based focuses on specific analysis needs
    const queryResults = {
      query: 'overdue_and_blocked_analysis',
      data: {
        overdue: tasks
          .filter((t) => t.dueDate && new Date(t.dueDate) < new Date())
          .slice(0, 5)
          .map((t) => ({
            id: t.id,
            name: t.name,
            days_overdue: Math.floor((new Date() - new Date(t.dueDate)) / (1000 * 60 * 60 * 24)),
          })),
        blocked: tasks
          .filter((t) => t.blocked)
          .slice(0, 5)
          .map((t) => ({
            id: t.id,
            name: t.name,
            project: t.project,
          })),
        next_actions: tasks
          .filter((t) => t.next)
          .slice(0, 5)
          .map((t) => ({
            id: t.id,
            name: t.name,
            project: t.project,
          })),
      },
      summary: {
        total_overdue: tasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date()).length,
        total_blocked: tasks.filter((t) => t.blocked).length,
        total_next: tasks.filter((t) => t.next).length,
      },
    };

    const fullJson = JSON.stringify(queryResults, null, 2);
    const estimate = this.estimateTokens(fullJson);

    return {
      actualTokens: estimate.tokens,
      chars: estimate.chars,
      kilobytes: estimate.kilobytes,
      contextUsage: Math.round((estimate.tokens / 200000) * 100),
    };
  }

  estimateTokens(text: string): TokenEstimate {
    // More accurate token estimation for JSON/code:
    // - Average ~3.5 characters per token for JSON (more structured than prose)
    // - Account for whitespace, punctuation, special chars
    const chars = text.length;
    const tokens = Math.round(chars / 3.5);

    return {
      tokens,
      chars,
      kilobytes: (chars / 1024).toFixed(2),
    };
  }

  provideRecommendations(
    raw: EstimateResult,
    smart: EstimateResult,
    hierarchical: EstimateResult,
    query: EstimateResult,
  ): void {
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

  analyzeNoteSizes(tasks: Task[], projects: Project[]): void {
    console.log('\n📝 Note Size Analysis:\n');

    // Analyze task notes
    const tasksWithNotes = tasks.filter((t) => t.note && t.note.length > 0);
    const taskNoteChars = tasksWithNotes.reduce((sum, t) => sum + t.note.length, 0);
    const taskNoteTokens = Math.round(taskNoteChars / 3.5);

    // Analyze project notes
    const projectsWithNotes = projects.filter((p) => p.note && p.note.length > 0);
    const projectNoteChars = projectsWithNotes.reduce((sum, p) => sum + p.note.length, 0);
    const projectNoteTokens = Math.round(projectNoteChars / 3.5);

    // Total note impact
    const totalNoteChars = taskNoteChars + projectNoteChars;
    const totalNoteTokens = taskNoteTokens + projectNoteTokens;
    const totalNoteKB = (totalNoteChars / 1024).toFixed(2);

    console.log('📊 Overall Note Statistics:');
    console.log(`   Total note size: ${totalNoteKB} KB (${totalNoteChars.toLocaleString()} chars)`);
    console.log(`   Estimated tokens: ${totalNoteTokens.toLocaleString()}`);
    console.log(
      `   Tasks with notes: ${tasksWithNotes.length} of ${tasks.length} (${Math.round((tasksWithNotes.length / tasks.length) * 100)}%)`,
    );
    console.log(
      `   Projects with notes: ${projectsWithNotes.length} of ${projects.length} (${Math.round((projectsWithNotes.length / projects.length) * 100)}%)`,
    );

    // Pareto Analysis: Combine tasks and projects, find 80% threshold
    const allItems = [
      ...tasksWithNotes.map((t) => ({
        type: 'task',
        id: t.id,
        name: t.name,
        noteLength: t.note.length,
        tokens: Math.round(t.note.length / 3.5),
      })),
      ...projectsWithNotes.map((p) => ({
        type: 'project',
        id: p.id,
        name: p.name,
        noteLength: p.note.length,
        tokens: Math.round(p.note.length / 3.5),
      })),
    ].sort((a, b) => b.noteLength - a.noteLength);

    // Calculate cumulative percentage and find 80% threshold
    const target80Percent = totalNoteTokens * 0.8;
    let cumulativeTokens = 0;
    let paretoIndex = 0;

    for (let i = 0; i < allItems.length; i++) {
      cumulativeTokens += allItems[i].tokens;
      if (cumulativeTokens >= target80Percent) {
        paretoIndex = i;
        break;
      }
    }

    const paretoItems = allItems.slice(0, paretoIndex + 1);
    const paretoTokens = paretoItems.reduce((sum, item) => sum + item.tokens, 0);
    const paretoPercentage = Math.round((paretoTokens / totalNoteTokens) * 100);

    console.log('\n🎯 Pareto Analysis (80/20 Rule):');
    console.log(`   Optimizing ${paretoItems.length} items would reduce notes by ${paretoPercentage}%`);
    console.log(
      `   These ${paretoItems.length} items contain ${paretoTokens.toLocaleString()} tokens of ${totalNoteTokens.toLocaleString()} total`,
    );
    console.log(
      `   That's ${Math.round((paretoItems.length / allItems.length) * 100)}% of items with notes, covering ${paretoPercentage}% of note size`,
    );

    console.log('\n📊 Optimization Priority List (Biggest Wins First):\n');

    let runningTotal = 0;
    paretoItems.forEach((item, i) => {
      runningTotal += item.tokens;
      const percentOfTotal = Math.round((runningTotal / totalNoteTokens) * 100);
      const icon = item.type === 'task' ? '📋' : '📁';

      console.log(`   ${i + 1}. ${icon} "${item.name.substring(0, 60)}${item.name.length > 60 ? '...' : ''}"`);
      console.log(`      Size: ${(item.noteLength / 1024).toFixed(2)} KB (${item.tokens.toLocaleString()} tokens)`);
      console.log(`      Cumulative: ${percentOfTotal}% of all notes`);

      // Add visual progress bar
      const barLength = 50;
      const filledLength = Math.round((percentOfTotal / 100) * barLength);
      const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
      console.log(`      Progress: [${bar}] ${percentOfTotal}%\n`);
    });

    // Calculate potential savings
    const potentialSavingsTokens = paretoTokens;
    const potentialSavingsKB = paretoItems.reduce((sum, item) => sum + item.noteLength, 0) / 1024;
    const newTotalTokens = 211638 - potentialSavingsTokens; // Current total - note savings
    const newContextUsage = Math.round((newTotalTokens / 200000) * 100);

    console.log('💰 Potential Savings:');
    console.log(`   If you optimize these ${paretoItems.length} items:`);
    console.log(`   - Save: ~${potentialSavingsTokens.toLocaleString()} tokens (${potentialSavingsKB.toFixed(2)} KB)`);
    console.log(`   - Database would shrink to: ~${newTotalTokens.toLocaleString()} tokens`);
    console.log(
      `   - Context window usage: ${newContextUsage}% (${newContextUsage > 100 ? '❌ still too large' : '✅ would fit!'})`,
    );

    // Recommendations based on note sizes
    console.log('\n💡 Note Optimization Recommendations:');
    if (totalNoteTokens > 50000) {
      console.log(
        `   ⚠️  Notes consume ${totalNoteTokens.toLocaleString()} tokens (${Math.round((totalNoteTokens / 211638) * 100)}% of total database)`,
      );
      console.log('   💡 Consider moving reference material to external links (Obsidian, wiki, etc.)');
    }

    const bloatedTasks = tasksWithNotes.filter((t) => t.note.length > 500).length;
    const bloatedProjects = projectsWithNotes.filter((p) => p.note.length > 1000).length;

    if (bloatedTasks > 0) {
      console.log(`   📋 ${bloatedTasks} tasks have notes >500 chars (consider external references)`);
    }
    if (bloatedProjects > 0) {
      console.log(`   📁 ${bloatedProjects} projects have notes >1000 chars (consider external references)`);
    }

    if (totalNoteTokens < 20000 && bloatedTasks === 0 && bloatedProjects === 0) {
      console.log('   ✅ Note usage is reasonable - no optimization needed');
    }
  }

  async stop(): Promise<void> {
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

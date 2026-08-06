/**
 * workflow-analysis-v3.ts - Pure OmniJS Workflow Analysis
 *
 * Performance improvement: Expected 10-30x faster (based on Phase 1 results)
 *
 * Key optimizations:
 * - Removed getUnifiedHelpers() (~18KB overhead)
 * - Direct property access instead of safeGet() wrappers
 * - Single evaluateJavascript() call for all analysis
 * - ALL property access in OmniJS context
 *
 * Converted from helper-based to pure OmniJS following v3 pattern.
 *
 * OMN-291: demoted to an EVIDENCE BUNDLE. This script screens and counts; it no
 * longer judges. The insight/recommendation generators, the per-project
 * healthScore/momentumScore composites, and the focus-area machinery are deleted
 * — per OMN-258's contract the server screens and evidences, and the caller
 * applies judgment. That now includes numeric weight-composites, not just prose.
 *
 * What it emits:
 * - Whole-DB counters (overdue/flagged/blocked/available/inbox/estimated time)
 * - workflowMetrics percentages, timeBuckets, per-tag stats
 * - Per-project mechanical rows: counts, rates, avgAge, deferral screen counts
 * - deferralAnalysis: totals plus two INDEPENDENT screen counts (over90Days,
 *   keywordMatched) and a top-10 detail list carrying a keywordMatched marker
 */

import { ROUND1_HELPER } from '../shared/helpers.js';

export const WORKFLOW_ANALYSIS_V3 = `
  (() => {
    const app = Application('OmniFocus');
    const options = {{options}};

    try {
      const startTime = Date.now();

      // Calculate current time
      const now = new Date();
      const nowTime = now.getTime();

      // Extract options in JXA context to pass to OmniJS
      // OMN-291: analysisDepth / focusAreas / maxInsights are gone. They only ever
      // gated and capped the insight+recommendation generators, which this ticket
      // deletes — workflow_analysis is an evidence bundle now, not a verdict source.
      const includeRawData = options.includeRawData || false;

      // Build comprehensive OmniJS script for ALL workflow analysis in one bridge call
      const analysisScript = \`
        (() => {
          ${ROUND1_HELPER}
          const nowTime = \${nowTime};
          const includeRawData = \${includeRawData};

          // OMN-291: a RECALL SCREEN, not a classifier. These substrings were derived
          // from one personal database and are locale-bound (English-only), so a hit
          // means "worth a look", never "this deferral is strategic". Rows report
          // keywordMatched as a candidate marker and the caller judges. Kept as one
          // shared const so the two loops below cannot drift apart.
          const DEFERRAL_KEYWORD_SCREEN = ['renewal', 'movie', 'annual', 'seasonal', 'quarterly', 'monthly'];
          const matchesDeferralKeyword = function (lowerName) {
            for (let k = 0; k < DEFERRAL_KEYWORD_SCREEN.length; k++) {
              if (lowerName.indexOf(DEFERRAL_KEYWORD_SCREEN[k]) !== -1) return true;
            }
            return false;
          };

          const now = new Date(nowTime);

          // Initialize analysis structures
          // OMN-291: the insights[] and recommendations[] accumulators are gone
          // along with the generators that filled them.
          const patterns = {};
          // OMN-208: data.tasks is capped independently of the full-population
          // metrics loop below (maxTasksToProcess stays = totalTasks). This cap
          // only protects the raw-record echo (currently unreachable in prod —
          // includeRawData is hardcoded false by OmniFocusAnalyzeTool — and
          // OMN-200 removed the old 1000-task cap that used to bound this array
          // incidentally).
          // OMN-233: byte accounting is now in place (RAW_DATA_BYTE_BUDGET
          // below) — push is gated on BOTH the count cap and a running byte
          // tally, since name/project/tags are unbounded strings and a
          // count-only cap can't bound payload size. The budget itself is
          // EXTRAPOLATED pending measurement: the ~261,124-char figure is the
          // measured evaluateJavascript INPUT-size limit
          // (EMPIRICAL_LIMITS.omniJsBridge in script-size-monitor.ts;
          // SCRIPT_SIZE_LIMITS.md) — the RETURN-path limit (this payload flows
          // FROM OmniJS back TO JXA, the opposite direction) has never been
          // separately measured. Before ever flipping includeRawData on, run
          // scripts/measure-bridge-return-limit.ts against live OmniFocus and
          // replace RAW_DATA_BYTE_BUDGET with a measured figure.
          const MAX_RAW_DATA_TASKS = 500;
          // Conservative fraction of the (unmeasured) ~261,124-char bridge
          // ceiling, leaving headroom for insights/patterns/recommendations
          // that share the same JSON.stringify() return payload.
          const RAW_DATA_BYTE_BUDGET = 150000;
          let rawDataTaskCount = 0;
          let rawDataBytesUsed = 0;
          // True UTF-8 byte length — JS String.length counts UTF-16 code units,
          // undercounting CJK (3 bytes vs 1 unit) and astral emoji (4 vs 2).
          // UTF-8 bytes >= UTF-16 units for every string, so this is conservative
          // whichever unit the (unmeasured) bridge limit actually binds on.
          // Code-point arithmetic: OmniJS has no TextEncoder/Buffer.
          function utf8ByteLength(str) {
            let bytes = 0;
            for (let i = 0; i < str.length; i++) {
              const cp = str.codePointAt(i);
              if (cp > 0xffff) i++; // astral: consumed a surrogate pair
              bytes += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
            }
            return bytes;
          }
          const data = {
            tasks: [],
            tasksTruncated: false,
            projects: [],
            workload: {},
            timePatterns: {},
            projectHealth: {}
          };

          // Analysis counters - focus on workflow health, not completion
          let overdueTasks = 0;
          let flaggedTasks = 0;
          let blockedTasks = 0;
          let availableTasks = 0;
          let totalEstimatedTime = 0;
          let totalOverdueDays = 0;
          let totalDeferredTasks = 0;
          let totalInboxTasks = 0;

          // Deferral analysis - distinguish good vs. problematic deferrals
          // OMN-291 (D16): the old strategic/problematic VERDICT split becomes two
          // independent, honestly-named screen counts. A deferral can match both,
          // or neither — they are not complements, unlike the labels they replace.
          let deferralsOver90Days = 0;
          let deferralsKeywordMatched = 0;
          const deferredTaskDetails = [];

          // Project analysis - focus on momentum and health
          const projectStats = {};

          // Time analysis
          const timeBuckets = {
            '0-1 days': 0,
            '1-3 days': 0,
            '3-7 days': 0,
            '1-2 weeks': 0,
            '2-4 weeks': 0,
            '1-3 months': 0,
            '3+ months': 0
          };

          // Workload analysis
          const workloadByTag = {};

          // OMN-270: the old PHASE 1 "accurate counts" (the root-task count
          // properties, JXA-only) is deleted, not fixed — every one of those
          // reads is undefined in OmniJS (live-probed 2026-07-16), so
          // projectAccurateStats was always {} and the merge/override phases
          // downstream only ever shipped the manual task-loop counts. Those
          // counts are correct now that the root-task skip below actually
          // fires.

          // PHASE 2: Process tasks for analysis
          const allTasks = flattenedTasks;
          const allProjects = flattenedProjects;
          const allTaskCount = allTasks.length;
          const totalProjects = allProjects.length;

          // OMN-200: always iterate the full task DB. The old cap processed only
          // the first 1000 tasks (a biased DB-order prefix) while the denominator
          // stayed full, so every workflowMetrics.*Percentage divided a capped
          // numerator by the full denominator — a systematic ~2.5x understatement.
          // OMN-270 (/code-review round 1) re-applies the same
          // numerator/denominator-agreement lesson to the root-task skip below:
          // totalTasks is counted IN the loop, after the skip, so the shared
          // denominator excludes exactly what the counters exclude. Raw
          // collection length survives only as the loop bound / dataPoints.
          const maxTasksToProcess = allTaskCount;
          let totalTasks = 0;

          for (let i = 0; i < maxTasksToProcess; i++) {
            const task = allTasks[i];

            try {
              const completed = task.completed || false;

              // Skip project ROOT tasks: the global flattenedTasks includes
              // each project's root task (which reads as actionable), unlike
              // project.flattenedTasks. OMN-270: the old gate read the
              // JXA-only child-count property — undefined in OmniJS — so it
              // never fired and every root polluted the task-level metrics.
              // A non-null task.project is the live root-task marker (PR
              // #227). Deliberately NOT the shared isProjectRootRow()
              // (IS_PROJECT_ROOT_ROW_SNIPPET, contracts/ast/types) here —
              // that predicate fails OPEN (treats a throw as "not root," so
              // the task IS counted), but this loop's whole per-task body
              // already lives in its own try/catch (this one), which has
              // always failed CLOSED: a task.project read that throws drops
              // the task from totalTasks and every derived metric, same as
              // any other per-task read failure. Using the shared predicate
              // here would silently flip that to fail-open (/code-review
              // regression, OMN-290 PR).
              if (task.project) {
                continue;
              }

              totalTasks++;

              const flagged = task.flagged || false;
              const blocked = task.taskStatus === Task.Status.Blocked;
              const isNext = !blocked && task.taskStatus === Task.Status.Available;

              // Get dates
              const dueDate = task.dueDate;
              const deferDate = task.deferDate;
              // OMN-251 (OMN-148 drift D17): added/modified are the OmniJS
              // property names — the previous reads (task.creationDate /
              // task.modificationDate, JXA names) were undefined here, so every
              // taskAge was 0 and the avgAge>120 health penalty never fired.
              const creationDate = task.added;
              const modificationDate = task.modified;

              // Calculate overdue days
              let overdueDays = 0;
              if (dueDate && !completed) {
                const dueDateMs = dueDate.getTime();
                if (dueDateMs < nowTime) {
                  overdueDays = Math.floor((nowTime - dueDateMs) / (1000 * 60 * 60 * 24));
                }
              }

              // Calculate task age
              const createdOrModified = creationDate || modificationDate;
              const taskAge = createdOrModified ?
                Math.floor((nowTime - createdOrModified.getTime()) / (1000 * 60 * 60 * 24)) : 0;

              const estimatedMinutes = task.estimatedMinutes || 0;
              const inInbox = task.inInbox;

              // Update counters - focus on workflow health
              if (overdueDays > 0) {
                overdueTasks++;
                totalOverdueDays += overdueDays;
              }
              if (flagged) flaggedTasks++;
              if (blocked) blockedTasks++;
              if (!completed && !blocked && isNext) availableTasks++;

              // Get project info
              const project = task.containingProject;
              const projectName = project ? (project.name || 'No Project') : 'Inbox';

              // Smart deferral analysis
              if (deferDate && deferDate.getTime() > nowTime) {
                totalDeferredTasks++;

                // OMN-291 (D16): measure, do not conclude. Two independent facts —
                // how far out the deferral reaches, and whether its name hit the
                // recall screen. The old isStrategic collapsed both into a verdict.
                const deferDays = Math.floor((deferDate.getTime() - nowTime) / (1000 * 60 * 60 * 24));
                const taskName = task.name || 'Unnamed Task';
                const keywordMatched = matchesDeferralKeyword(taskName.toLowerCase());
                const over90Days = deferDays > 90;

                if (over90Days) deferralsOver90Days++;
                if (keywordMatched) deferralsKeywordMatched++;

                // Store deferral details for pattern analysis
                deferredTaskDetails.push({
                  name: taskName,
                  deferDays: deferDays,
                  keywordMatched: keywordMatched,
                  project: projectName
                });
              }

              if (inInbox && !completed) totalInboxTasks++;

              totalEstimatedTime += estimatedMinutes;

              // Time bucket analysis
              if (overdueDays <= 1) timeBuckets['0-1 days']++;
              else if (overdueDays <= 3) timeBuckets['1-3 days']++;
              else if (overdueDays <= 7) timeBuckets['3-7 days']++;
              else if (overdueDays <= 14) timeBuckets['1-2 weeks']++;
              else if (overdueDays <= 28) timeBuckets['2-4 weeks']++;
              else if (overdueDays <= 90) timeBuckets['1-3 months']++;
              else timeBuckets['3+ months']++;

              // Project analysis - focus on momentum and workflow health
              if (!inInbox) {
                if (!projectStats[projectName]) {
                  projectStats[projectName] = {
                    total: 0,
                    completed: 0,
                    overdue: 0,
                    flagged: 0,
                    blocked: 0,
                    available: 0,
                    deferred: 0,
                    // OMN-291 (D16): honest screen counts, replacing the
                    // strategicDeferred/problematicDeferred verdict split.
                    deferredOver90Days: 0,
                    deferredKeywordMatched: 0,
                    estimatedTime: 0,
                    avgAge: 0,
                    totalAge: 0
                  };
                }

                projectStats[projectName].total++;
                if (completed) projectStats[projectName].completed++;
                if (overdueDays > 0) projectStats[projectName].overdue++;
                if (flagged) projectStats[projectName].flagged++;
                if (blocked) projectStats[projectName].blocked++;
                if (!completed && !blocked && isNext) projectStats[projectName].available++;

                // Track deferrals by type
                if (deferDate && deferDate.getTime() > nowTime) {
                  projectStats[projectName].deferred++;

                  // OMN-291 (D16): same two independent facts as the global pass,
                  // computed through the same shared screen so they cannot drift.
                  const deferDays = Math.floor((deferDate.getTime() - nowTime) / (1000 * 60 * 60 * 24));
                  const taskName = task.name || 'Unnamed Task';

                  if (deferDays > 90) projectStats[projectName].deferredOver90Days++;
                  if (matchesDeferralKeyword(taskName.toLowerCase())) {
                    projectStats[projectName].deferredKeywordMatched++;
                  }
                }

                projectStats[projectName].estimatedTime += estimatedMinutes;
                projectStats[projectName].totalAge += taskAge;
              }

              // Tag analysis
              const taskTags = task.tags || [];
              const tags = [];
              taskTags.forEach(tag => {
                try {
                  const tagName = tag.name;
                  if (tagName) tags.push(tagName);
                } catch (e) {
                  // Skip invalid tags
                }
              });

              tags.forEach(tag => {
                if (!workloadByTag[tag]) {
                  workloadByTag[tag] = {
                    total: 0,
                    completed: 0,
                    overdue: 0,
                    estimatedTime: 0
                  };
                }
                workloadByTag[tag].total++;
                if (completed) workloadByTag[tag].completed++;
                if (overdueDays > 0) workloadByTag[tag].overdue++;
                workloadByTag[tag].estimatedTime += estimatedMinutes;
              });

              // Include task data if requested
              // OMN-208/OMN-233: cap at push time on BOTH the task-count cap
              // and a running byte tally, so the OmniJS-side array never
              // grows past MAX_RAW_DATA_TASKS or RAW_DATA_BYTE_BUDGET,
              // regardless of DB size or record size. Counting past the cap
              // (instead of stopping) lets data.tasksTruncated report an
              // accurate "N more omitted" figure without re-scanning.
              if (includeRawData) {
                rawDataTaskCount++;
                if (!data.tasksTruncated) {
                  const rawDataRecord = {
                    id: task.id.primaryKey || 'unknown',
                    name: task.name || 'Unnamed Task',
                    completed,
                    flagged,
                    blocked,
                    next: isNext,
                    overdueDays,
                    taskAge,
                    estimatedMinutes,
                    project: projectName,
                    tags,
                    dueDate: dueDate ? dueDate.toISOString() : null,
                    deferDate: deferDate ? deferDate.toISOString() : null
                  };
                  const rawDataRecordBytes = utf8ByteLength(JSON.stringify(rawDataRecord));
                  if (
                    data.tasks.length < MAX_RAW_DATA_TASKS &&
                    rawDataBytesUsed + rawDataRecordBytes <= RAW_DATA_BYTE_BUDGET
                  ) {
                    data.tasks.push(rawDataRecord);
                    rawDataBytesUsed += rawDataRecordBytes;
                  } else {
                    data.tasksTruncated = true;
                  }
                }
              }

            } catch (e) {
              // Skip tasks that cause errors
              continue;
            }
          }

          // PHASE 4: Calculate project momentum and workflow health scores
          // (OMN-270: the old PHASE 3 merge and the omniFocusAvailable
          // override branch here consumed the deleted dead phase and never
          // fired — this manual calculation is the path that always shipped.)
          Object.keys(projectStats).forEach(projectName => {
            const stats = projectStats[projectName];
            const avgAge = stats.total > 0 ? Math.round(stats.totalAge / stats.total) : 0;

            const availableRate = stats.total > 0 ? round1(stats.available / stats.total * 100) : 0;

            const overdueRate = stats.total > 0 ? round1(stats.overdue / stats.total * 100) : 0;

            stats.avgAge = avgAge;
            stats.availableRate = availableRate;
            stats.overdueRate = overdueRate;

            // OMN-291 (D19): healthScore and momentumScore are DELETED here.
            //
            // healthScore was 100 minus a hand-tuned weight stack (overdue 25,
            // blocked 20, stale-age 15, problematic-deferral 15, low-available 10,
            // +5 strategic bonus). A weighted composite IS a verdict — the weights
            // encode what matters and by how much, which is the caller's judgment
            // to make, not the server's. Its components all survive as separate
            // facts below (overdue, blocked, avgAge, availableRate, deferrals).
            //
            // momentumScore additionally had a direction bug: it SUBTRACTED
            // availableRate, so a project with more available work scored LOWER
            // momentum, contradicting the prose that shipped alongside it.
            // Deleting it makes that bug historical rather than something to fix.
          });

          // OMN-291 (D-GTD + D20 + D21): PHASE 5 (the productivity / workload /
          // bottlenecks / project_health / time_patterns / opportunities insight
          // generators) and the recommendation block that followed it are DELETED,
          // live branches and dead ones alike.
          //
          // Per OMN-258's contract the server SCREENS and EVIDENCES; it does not
          // rank by embedded judgment. That now explicitly includes numeric
          // weight-composites, not just prose. Everything these blocks emitted was
          // a verdict wearing a data shape: priority labels the caller never chose,
          // an invented "N x 1.5 dependent tasks" multiplier with no basis (D21),
          // and three focus-area branches (project_health, time_patterns,
          // opportunities) that could never fire because the handler only ever
          // passed productivity/workload/bottlenecks (D20).
          //
          // The facts they were computed FROM all survive in the evidence bundle
          // below. The caller applies its own thresholds and priorities.
          // Build patterns object focused on workflow health
          // OMN-291: mechanical rows only. Every field is a count, a rate, or a mean
          // — no composite, no grade, no label. avgAge is the mean of day-ages (live
          // since OMN-251) and is a FACT; the caller applies any staleness threshold.
          const workloadByProject = {};
          Object.keys(projectStats).forEach(name => {
            const stats = projectStats[name];
            workloadByProject[name] = {
              total: stats.total,
              completed: stats.completed,
              available: stats.available,
              overdue: stats.overdue,
              blocked: stats.blocked,
              estimatedHours: Math.round(stats.estimatedTime / 60),
              overdueRate: stats.overdueRate,
              availableRate: stats.availableRate,
              avgAge: stats.avgAge,
              deferrals: {
                total: stats.deferred,
                over90Days: stats.deferredOver90Days,
                keywordMatched: stats.deferredKeywordMatched
              }
            };
          });

          patterns.workloadDistribution = {
            byProject: workloadByProject,
            byTag: workloadByTag,
            timeBuckets: timeBuckets
          };

          patterns.workflowMetrics = {
            availablePercentage: totalTasks > 0 ? round1(availableTasks / totalTasks * 100) : 0,
            overduePercentage: totalTasks > 0 ? round1(overdueTasks / totalTasks * 100) : 0,
            flaggedPercentage: totalTasks > 0 ? round1(flaggedTasks / totalTasks * 100) : 0,
            blockedPercentage: totalTasks > 0 ? round1(blockedTasks / totalTasks * 100) : 0,
            deferredPercentage: totalTasks > 0 ? round1(totalDeferredTasks / totalTasks * 100) : 0,
            // OMN-291 (D16): screen counts, not the old strategic/problematic verdict.
            deferredOver90DaysPercentage: totalTasks > 0 ? round1(deferralsOver90Days / totalTasks * 100) : 0,
            deferredKeywordMatchedPercentage: totalTasks > 0 ? round1(deferralsKeywordMatched / totalTasks * 100) : 0,
            inboxPercentage: totalTasks > 0 ? round1(totalInboxTasks / totalTasks * 100) : 0
          };

          // Add deferral pattern analysis
          patterns.deferralAnalysis = {
            totalDeferred: totalDeferredTasks,
            // OMN-291 (D16): two independent screen counts. A deferral can be in
            // both, or neither — they do NOT sum to totalDeferred, unlike the
            // strategic/problematic split they replace.
            over90Days: deferralsOver90Days,
            keywordMatched: deferralsKeywordMatched,
            over90DaysRate: totalTasks > 0 ? round1(deferralsOver90Days / totalTasks * 100) : 0,
            keywordMatchedRate: totalTasks > 0 ? round1(deferralsKeywordMatched / totalTasks * 100) : 0,
            // True "Top 10": rank by deferral magnitude (longest defer first), not DB iteration order
            deferralDetails: deferredTaskDetails.slice().sort(function(a, b) { return b.deferDays - a.deferDays; }).slice(0, 10)
          };

          // OMN-208/OMN-233: surface how many raw records were omitted by the
          // caps above (count cap OR byte budget, whichever hit first). 0 when
          // includeRawData is false (data.tasks was never populated) or when
          // the population is within both caps. Keyed off tasksTruncated and
          // the actual pushed length — not a second independent cap
          // comparison — so this can't desync from the loop's gating.
          data.tasksOmittedCount = data.tasksTruncated
            ? rawDataTaskCount - data.tasks.length
            : 0;

          // OMN-291: insights and recommendations are gone from the payload.
          return JSON.stringify({
            patterns: patterns,
            data: includeRawData ? data : undefined,
            totalTasks: totalTasks,
            totalProjects: totalProjects,
            dataPoints: maxTasksToProcess
          });
        })()
      \`;

      // Execute OmniJS script - SINGLE BRIDGE CALL!
      const resultJson = app.evaluateJavascript(analysisScript);
      const analysis = JSON.parse(resultJson);

      const endTime = Date.now();
      const analysisTime = endTime - startTime;

      // Return v3 format matching original script structure
      return JSON.stringify({
        ok: true,
        v: '3',
        data: {
          patterns: analysis.patterns,
          data: analysis.data,
          totalTasks: analysis.totalTasks,
          totalProjects: analysis.totalProjects,
          analysisTime: analysisTime,
          dataPoints: analysis.dataPoints,
          metadata: {
            method: 'omnijs_v3_single_bridge',
            optimization: 'omnijs_v3',
            query_time_ms: analysisTime,
            note: 'All analysis calculated in single OmniJS bridge call for maximum performance'
          }
        }
      });

    } catch (error) {
      return JSON.stringify({
        ok: false,
        v: '3',
        error: {
          message: 'Failed to analyze workflow: ' + (error && error.toString ? error.toString() : 'Unknown error'),
          details: error && error.message ? error.message : undefined
        }
      });
    }
  })();
`;

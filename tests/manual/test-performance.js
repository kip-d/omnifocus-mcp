#!/usr/bin/env node

import { OmniAutomation } from '../dist/omnifocus/OmniAutomation.js';
import { TODAYS_AGENDA_SCRIPT } from '../dist/omnifocus/scripts/tasks.js';
import { GET_UPCOMING_TASKS_OPTIMIZED_SCRIPT } from '../dist/omnifocus/scripts/date-range-queries.js';

async function testPerformance() {
  const omni = new OmniAutomation();

  console.log('Testing performance optimizations...\n');

  // Test Today's Agenda
  try {
    console.log("1. Today's Agenda Script:");
    const agendaScript = omni.buildScript(TODAYS_AGENDA_SCRIPT, {
      options: {
        includeFlagged: true,
        includeOverdue: true,
        includeAvailable: false,
        includeDetails: false,
        limit: 50,
      },
    });

    // Check if optimizations are in the script
    console.log('- Script includes incomplete filter:', agendaScript.includes('completed: false'));
    console.log('- Script includes smart_agenda_filter:', agendaScript.includes('smart_agenda_filter'));
    console.log('- Default limit is 50:', agendaScript.includes('limit: 50'));
    console.log('- includeDetails default false:', agendaScript.includes('includeDetails === true'));

    console.log('\n2. Upcoming Tasks Script:');
    const upcomingScript = omni.buildScript(GET_UPCOMING_TASKS_OPTIMIZED_SCRIPT, {
      days: 7,
      includeToday: true,
      limit: 50,
    });

    // Check optimizations
    console.log('- Script includes query optimization:', upcomingScript.includes('whose({'));
    console.log('- Script includes dueDate filter:', upcomingScript.includes('dueDate: {_not: null}'));
    console.log('- Limit is 50:', upcomingScript.includes('limit = 50'));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testPerformance();

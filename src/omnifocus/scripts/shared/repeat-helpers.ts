/**
 * Repeat/recurrence helper functions for JXA scripts
 * These functions help convert repeat rule schemas to OmniFocus RepetitionRule objects
 */

export const REPEAT_HELPERS = `
  // Convert repeat rule to RRULE format string
  function convertToRRULE(rule) {
    if (!rule || !rule.unit || !rule.steps) return '';
    
    let rrule = '';
    
    // Basic frequency mapping
    switch (rule.unit) {
      case 'minute':
        rrule = 'FREQ=MINUTELY';
        break;
      case 'hour':
        rrule = 'FREQ=HOURLY';
        break;
      case 'day':
        rrule = 'FREQ=DAILY';
        break;
      case 'week':
        rrule = 'FREQ=WEEKLY';
        break;
      case 'month':
        rrule = 'FREQ=MONTHLY';
        break;
      case 'year':
        rrule = 'FREQ=YEARLY';
        break;
      default:
        return '';
    }
    
    // Add interval if > 1
    if (rule.steps > 1) {
      rrule += ';INTERVAL=' + rule.steps;
    }
    
    // Add weekdays for weekly patterns
    if (rule.weekdays && rule.weekdays.length > 0) {
      const weekdayMap = {
        'sunday': 'SU',
        'monday': 'MO', 
        'tuesday': 'TU',
        'wednesday': 'WE',
        'thursday': 'TH',
        'friday': 'FR',
        'saturday': 'SA'
      };
      
      const days = rule.weekdays.map(function(day) {
        return weekdayMap[day] || '';
      }).filter(function(day) {
        return day !== '';
      }).join(',');
      
      if (days) {
        rrule += ';BYDAY=' + days;
      }
    }
    
    // Add monthly positional patterns
    if (rule.weekPosition && rule.weekday) {
      const weekdayMap = {
        'sunday': 'SU',
        'monday': 'MO',
        'tuesday': 'TU', 
        'wednesday': 'WE',
        'thursday': 'TH',
        'friday': 'FR',
        'saturday': 'SA'
      };
      
      const weekdayCode = weekdayMap[rule.weekday];
      
      if (weekdayCode) {
        if (Array.isArray(rule.weekPosition)) {
          const positions = rule.weekPosition.map(function(pos) {
            return pos === 'last' ? '-1' + weekdayCode : pos + weekdayCode;
          }).join(',');
          rrule += ';BYDAY=' + positions;
        } else {
          const position = rule.weekPosition === 'last' ? '-1' : rule.weekPosition.toString();
          rrule += ';BYDAY=' + position + weekdayCode;
        }
      }
    }
    
    return rrule;
  }

  // Convert repeat method to OmniFocus RepetitionMethod
  function convertToOmniMethod(method) {
    switch (method) {
      case 'fixed':
        return 'Fixed';
      case 'start-after-completion':
        return 'DeferUntilDate';
      case 'due-after-completion':
        return 'DueDate';
      case 'none':
      default:
        return 'None';
    }
  }

  // Create OmniFocus RepetitionRule from our repeat rule object
  function createRepetitionRule(rule) {
    if (!rule || !rule.unit || !rule.steps) return null;
    
    try {
      const app = Application('OmniFocus');
      const ruleString = convertToRRULE(rule);
      const method = convertToOmniMethod(rule.method || 'fixed');
      
      if (!ruleString) {
        console.log('Failed to generate RRULE string from rule:', JSON.stringify(rule));
        return null;
      }
      
      // Create RepetitionRule using the appropriate method constant
      let methodConstant;
      switch (method) {
        case 'Fixed':
          methodConstant = app.Task.RepetitionMethod.Fixed;
          break;
        case 'DeferUntilDate':
          methodConstant = app.Task.RepetitionMethod.DeferUntilDate;
          break;
        case 'DueDate':
          methodConstant = app.Task.RepetitionMethod.DueDate;
          break;
        case 'None':
        default:
          methodConstant = app.Task.RepetitionMethod.None;
          break;
      }
      
      // Create the RepetitionRule
      const repetitionRule = app.Task.RepetitionRule(ruleString, methodConstant);
      
      console.log('Created RepetitionRule with ruleString:', ruleString, 'method:', method);
      return repetitionRule;
      
    } catch (error) {
      console.log('Error creating RepetitionRule:', error.message);
      console.log('Rule data:', JSON.stringify(rule));
      return null;
    }
  }

  // Apply defer another settings if specified
  function applyDeferAnother(task, rule) {
    if (!rule.deferAnother || !task.dueDate()) return;
    
    try {
      const dueDate = task.dueDate();
      const deferUnit = rule.deferAnother.unit;
      const deferSteps = rule.deferAnother.steps;
      
      let deferMilliseconds = 0;
      
      switch (deferUnit) {
        case 'minute':
          deferMilliseconds = deferSteps * 60 * 1000;
          break;
        case 'hour':
          deferMilliseconds = deferSteps * 60 * 60 * 1000;
          break;
        case 'day':
          deferMilliseconds = deferSteps * 24 * 60 * 60 * 1000;
          break;
        case 'week':
          deferMilliseconds = deferSteps * 7 * 24 * 60 * 60 * 1000;
          break;
        case 'month':
          // Approximate month as 30 days
          deferMilliseconds = deferSteps * 30 * 24 * 60 * 60 * 1000;
          break;
        case 'year':
          // Approximate year as 365 days
          deferMilliseconds = deferSteps * 365 * 24 * 60 * 60 * 1000;
          break;
      }
      
      if (deferMilliseconds > 0) {
        const deferDate = new Date(dueDate.getTime() - deferMilliseconds);
        task.deferDate = deferDate;
        console.log('Applied defer another:', deferSteps, deferUnit, 'before due date');
      }
      
    } catch (error) {
      console.log('Error applying defer another:', error.message);
    }
  }

  // Extract repeat rule information from existing OmniFocus RepetitionRule
  function extractRepeatRuleInfo(repetitionRule) {
    if (!repetitionRule) return null;
    
    const ruleData = {
      method: null,
      ruleString: null,
      unit: null,
      steps: null,
      _inferenceSource: 'api'
    };
    
    try {
      // Get method
      const method = repetitionRule.method();
      if (method) {
        switch (method.toString()) {
          case 'Fixed':
            ruleData.method = 'fixed';
            break;
          case 'DeferUntilDate':
            ruleData.method = 'start-after-completion';
            break;
          case 'DueDate':
            ruleData.method = 'due-after-completion';
            break;
          case 'None':
          default:
            ruleData.method = 'none';
            break;
        }
      }
      
      // Get rule string
      const ruleString = repetitionRule.ruleString();
      if (ruleString) {
        ruleData.ruleString = ruleString.toString();
        
        // Parse RRULE format to extract frequency details
        const ruleStr = ruleData.ruleString;
        
        // Parse FREQ= part
        if (ruleStr.includes('FREQ=MINUTELY')) {
          ruleData.unit = 'minute';
          ruleData.steps = 1;
        } else if (ruleStr.includes('FREQ=HOURLY')) {
          ruleData.unit = 'hour';
          ruleData.steps = 1;
        } else if (ruleStr.includes('FREQ=DAILY')) {
          ruleData.unit = 'day';
          ruleData.steps = 1;
        } else if (ruleStr.includes('FREQ=WEEKLY')) {
          ruleData.unit = 'week';
          ruleData.steps = 1;
        } else if (ruleStr.includes('FREQ=MONTHLY')) {
          ruleData.unit = 'month';
          ruleData.steps = 1;
        } else if (ruleStr.includes('FREQ=YEARLY')) {
          ruleData.unit = 'year';
          ruleData.steps = 1;
        }
        
        // Parse INTERVAL= part for custom frequencies
        const intervalMatch = ruleStr.match(/INTERVAL=(\\d+)/);
        if (intervalMatch) {
          ruleData.steps = parseInt(intervalMatch[1]);
        }
        
        // Parse BYDAY for weekly/monthly patterns
        const bydayMatch = ruleStr.match(/BYDAY=([^;]+)/);
        if (bydayMatch) {
          const bydayValue = bydayMatch[1];
          // This could be parsed further for specific days/positions
          ruleData.bydayRaw = bydayValue;
        }
        
        ruleData._inferenceSource = 'ruleString';
      }
      
    } catch (error) {
      console.log('Error extracting repeat rule info:', error.message);
    }
    
    return ruleData;
  }
`;
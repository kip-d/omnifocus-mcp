/**
 * Translate user intent (LLM-friendly) to OmniFocus 4.7+ parameters
 * This layer hides RRULE/constructor details from end users
 *
 * Key principle: Users think in terms of intent ("when marked done"),
 * we translate to OmniFocus internals (anchorDateKey, scheduleType, method)
 */

export type AnchorIntent =
  | 'when-deferred'       // Start counting from defer date (4.6.1+)
  | 'when-due'            // Start counting from due date (4.6.1+) - DEFAULT
  | 'when-marked-done'    // Start counting from completion (4.7+)
  | 'planned-date';       // Start counting from planned date (4.7+)

export interface RepeatUserIntent {
  frequency: string;       // "every 3 days", "weekly on Monday", etc. (RRULE format)
  anchorTo: AnchorIntent;  // Where to anchor the repeat
  skipMissed: boolean;     // Should we catch up on missed occurrences?
  endCondition?: {
    type: 'never' | 'afterDate' | 'afterOccurrences';
    date?: string;         // For afterDate
    count?: number;        // For afterOccurrences
  };
}

export interface OmniFocusRepeatParams {
  ruleString: string;            // RRULE format: "FREQ=DAILY;INTERVAL=3"
  method: string;                // RepetitionMethod: "Fixed" | "DeferUntilDate" | "DueDate"
  scheduleType: string;          // RepetitionScheduleType: "Regularly" | "FromCompletion" | "None"
  anchorDateKey: string;         // AnchorDateKey: "DeferDate" | "DueDate" | "PlannedDate"
  catchUpAutomatically: boolean; // Should skip missed occurrences
  _source: 'user-intent';
}

/**
 * Map user intent "anchorTo" to OmniFocus internal parameters
 * Note: OmniFocus 4.7+ is required, so all versions are 4.7+ compatible
 */
export function mapAnchorIntentToOmniFocus(anchorTo: AnchorIntent): {
  anchorDateKey: string;
  method: string;
  scheduleType: string;
} {
  const mapping: Record<AnchorIntent, any> = {
    'when-deferred': {
      anchorDateKey: 'DeferDate',
      method: 'DeferUntilDate',
      scheduleType: 'FromCompletion'
    },
    'when-due': {
      anchorDateKey: 'DueDate',
      method: 'Fixed',
      scheduleType: 'Regularly'
    },
    'when-marked-done': {
      anchorDateKey: 'DueDate',
      method: 'DueDate',
      scheduleType: 'FromCompletion'
    },
    'planned-date': {
      anchorDateKey: 'PlannedDate',
      method: 'Fixed',
      scheduleType: 'Regularly'
    }
  };

  return mapping[anchorTo];
}

/**
 * Translate user intent to OmniFocus constructor parameters
 */
export function translateRepeatIntent(intent: RepeatUserIntent): OmniFocusRepeatParams {
  const omniFocusParams = mapAnchorIntentToOmniFocus(intent.anchorTo);

  return {
    ruleString: intent.frequency, // Already in RRULE format
    method: omniFocusParams.method,
    scheduleType: omniFocusParams.scheduleType,
    anchorDateKey: omniFocusParams.anchorDateKey,
    catchUpAutomatically: intent.skipMissed ?? false,
    _source: 'user-intent'
  };
}


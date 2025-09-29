/**
 * Temporary ID Resolution System
 *
 * Manages temporary IDs and their mapping to real OmniFocus IDs
 * during batch creation operations.
 */

export interface TempIdMapping {
  tempId: string;
  realId: string | null;
  type: 'project' | 'task';
  created: boolean;
  error?: string;
}

/**
 * Resolves temporary IDs to real OmniFocus IDs
 */
export class TempIdResolver {
  private readonly mappings: Map<string, TempIdMapping>;

  constructor() {
    this.mappings = new Map();
  }

  /**
   * Register a temporary ID
   */
  register(tempId: string, type: 'project' | 'task'): void {
    if (this.mappings.has(tempId)) {
      throw new Error(`Temporary ID already registered: ${tempId}`);
    }

    this.mappings.set(tempId, {
      tempId,
      realId: null,
      type,
      created: false,
    });
  }

  /**
   * Set the real ID for a temporary ID after creation
   */
  resolve(tempId: string, realId: string): void {
    const mapping = this.mappings.get(tempId);
    if (!mapping) {
      throw new Error(`Unknown temporary ID: ${tempId}`);
    }

    mapping.realId = realId;
    mapping.created = true;
  }

  /**
   * Mark a temporary ID as failed
   */
  markFailed(tempId: string, error: string): void {
    const mapping = this.mappings.get(tempId);
    if (!mapping) {
      throw new Error(`Unknown temporary ID: ${tempId}`);
    }

    mapping.error = error;
    mapping.created = false;
  }

  /**
   * Get the real ID for a temporary ID
   * Returns null if not yet resolved
   */
  getRealId(tempId: string): string | null {
    const mapping = this.mappings.get(tempId);
    return mapping?.realId ?? null;
  }

  /**
   * Check if a temporary ID exists
   */
  has(tempId: string): boolean {
    return this.mappings.has(tempId);
  }

  /**
   * Check if a temporary ID has been resolved
   */
  isResolved(tempId: string): boolean {
    const mapping = this.mappings.get(tempId);
    return mapping?.created === true && mapping.realId !== null;
  }

  /**
   * Get all successfully created IDs (for rollback)
   */
  getCreatedIds(): Array<{ tempId: string; realId: string; type: 'project' | 'task' }> {
    const created: Array<{ tempId: string; realId: string; type: 'project' | 'task' }> = [];

    for (const mapping of this.mappings.values()) {
      if (mapping.created && mapping.realId) {
        created.push({
          tempId: mapping.tempId,
          realId: mapping.realId,
          type: mapping.type,
        });
      }
    }

    return created;
  }

  /**
   * Get all mappings as a simple object for response
   */
  getMappings(): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [tempId, mapping] of this.mappings.entries()) {
      if (mapping.realId) {
        result[tempId] = mapping.realId;
      }
    }

    return result;
  }

  /**
   * Get detailed status for all items
   */
  getDetailedStatus(): TempIdMapping[] {
    return Array.from(this.mappings.values());
  }

  /**
   * Get count of successfully created items
   */
  getCreatedCount(): number {
    let count = 0;
    for (const mapping of this.mappings.values()) {
      if (mapping.created) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get count of failed items
   */
  getFailedCount(): number {
    let count = 0;
    for (const mapping of this.mappings.values()) {
      if (mapping.error) {
        count++;
      }
    }
    return count;
  }
}
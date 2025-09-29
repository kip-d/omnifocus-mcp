/**
 * Dependency Graph for Batch Operations
 *
 * Determines the correct creation order for items based on their
 * parent-child relationships using temporary IDs.
 */

// Minimal interface for dependency analysis
export interface BatchItemMinimal {
  tempId: string;
  parentTempId?: string;
  type: 'project' | 'task';
  name: string;
  [key: string]: unknown;
}

// For compatibility with full schema
export type BatchItem = BatchItemMinimal;

export interface DependencyNode {
  item: BatchItem;
  dependencies: string[]; // tempIds this item depends on
  dependents: string[];   // tempIds that depend on this item
}

export class DependencyGraphError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'DependencyGraphError';
  }
}

/**
 * Builds and validates dependency graph for batch items
 */
export class DependencyGraph {
  private readonly nodes: Map<string, DependencyNode>;

  constructor(items: BatchItem[]) {
    this.nodes = new Map();

    // Build nodes
    for (const item of items) {
      if (this.nodes.has(item.tempId)) {
        throw new DependencyGraphError(
          `Duplicate temporary ID: ${item.tempId}`,
          { tempId: item.tempId },
        );
      }

      this.nodes.set(item.tempId, {
        item,
        dependencies: [],
        dependents: [],
      });
    }

    // Build dependency relationships
    for (const item of items) {
      if (item.parentTempId) {
        const node = this.nodes.get(item.tempId)!;
        const parentNode = this.nodes.get(item.parentTempId);

        if (!parentNode) {
          throw new DependencyGraphError(
            `Unknown parent temporary ID: ${item.parentTempId}`,
            { tempId: item.tempId, parentTempId: item.parentTempId },
          );
        }

        // Add dependency
        node.dependencies.push(item.parentTempId);
        parentNode.dependents.push(item.tempId);
      }
    }

    // Validate no circular dependencies
    this.validateNoCycles();
  }

  /**
   * Get items in dependency order (parents before children)
   * Uses topological sort
   */
  getCreationOrder(): BatchItem[] {
    const ordered: BatchItem[] = [];
    const visited = new Set<string>();
    const inProgress = new Set<string>();

    const visit = (tempId: string): void => {
      if (visited.has(tempId)) {
        return;
      }

      if (inProgress.has(tempId)) {
        throw new DependencyGraphError(
          'Circular dependency detected',
          { tempId, cycle: Array.from(inProgress) },
        );
      }

      inProgress.add(tempId);

      const node = this.nodes.get(tempId)!;

      // Visit dependencies first (parents)
      for (const depId of node.dependencies) {
        visit(depId);
      }

      inProgress.delete(tempId);
      visited.add(tempId);
      ordered.push(node.item);
    };

    // Visit all nodes
    for (const tempId of this.nodes.keys()) {
      visit(tempId);
    }

    return ordered;
  }

  /**
   * Validate no circular dependencies exist
   */
  private validateNoCycles(): void {
    const visited = new Set<string>();
    const inProgress = new Set<string>();

    const visit = (tempId: string, path: string[]): void => {
      if (visited.has(tempId)) {
        return;
      }

      if (inProgress.has(tempId)) {
        throw new DependencyGraphError(
          `Circular dependency detected: ${path.join(' -> ')} -> ${tempId}`,
          { cycle: [...path, tempId] },
        );
      }

      inProgress.add(tempId);
      path.push(tempId);

      const node = this.nodes.get(tempId)!;
      for (const depId of node.dependencies) {
        visit(depId, [...path]);
      }

      inProgress.delete(tempId);
      visited.add(tempId);
    };

    for (const tempId of this.nodes.keys()) {
      visit(tempId, []);
    }
  }

  /**
   * Get items that have no dependencies (can be created first)
   */
  getRootItems(): BatchItem[] {
    const roots: BatchItem[] = [];

    for (const node of this.nodes.values()) {
      if (node.dependencies.length === 0) {
        roots.push(node.item);
      }
    }

    return roots;
  }

  /**
   * Get immediate children of an item
   */
  getChildren(tempId: string): BatchItem[] {
    const node = this.nodes.get(tempId);
    if (!node) {
      return [];
    }

    return node.dependents
      .map(id => this.nodes.get(id)?.item)
      .filter((item): item is BatchItem => item !== undefined);
  }

  /**
   * Get statistics about the graph
   */
  getStats(): {
    totalItems: number;
    rootItems: number;
    maxDepth: number;
    projects: number;
    tasks: number;
  } {
    const roots = this.getRootItems();
    let maxDepth = 0;
    let projects = 0;
    let tasks = 0;

    const getDepth = (tempId: string): number => {
      const node = this.nodes.get(tempId)!;
      if (node.dependencies.length === 0) {
        return 0;
      }
      return 1 + Math.max(...node.dependencies.map(getDepth));
    };

    for (const node of this.nodes.values()) {
      const depth = getDepth(node.item.tempId);
      maxDepth = Math.max(maxDepth, depth);

      if (node.item.type === 'project') {
        projects++;
      } else {
        tasks++;
      }
    }

    return {
      totalItems: this.nodes.size,
      rootItems: roots.length,
      maxDepth,
      projects,
      tasks,
    };
  }
}
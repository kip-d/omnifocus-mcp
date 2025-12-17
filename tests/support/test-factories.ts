/**
 * Test Factories for creating mock data in tests
 * These provide consistent, realistic test data without external dependencies
 */

export interface MockTask {
  id: string;
  name: string;
  flagged: boolean;
  completed: boolean;
  dueDate?: string;
  deferDate?: string;
  note?: string;
  tags?: string[];
  projectId?: string;
  estimatedMinutes?: number;
}

export interface MockProject {
  id: string;
  name: string;
  status: 'active' | 'onHold' | 'dropped' | 'completed';
  flagged: boolean;
  sequential: boolean;
  dueDate?: string;
  deferDate?: string;
  note?: string;
  tags?: string[];
}

export class TestDataFactory {
  private static counter = 0;

  static createMockTask(overrides: Partial<MockTask> = {}): MockTask {
    this.counter++;
    return {
      id: `task-${this.counter}-${Date.now()}`,
      name: `Test Task ${this.counter}`,
      flagged: false,
      completed: false,
      ...overrides,
    };
  }

  static createMockProject(overrides: Partial<MockProject> = {}): MockProject {
    this.counter++;
    return {
      id: `project-${this.counter}-${Date.now()}`,
      name: `Test Project ${this.counter}`,
      status: 'active',
      flagged: false,
      sequential: false,
      ...overrides,
    };
  }

  static createMockTaskArray(count: number, overrides: Partial<MockTask> = {}): MockTask[] {
    return Array.from({ length: count }, () => this.createMockTask(overrides));
  }

  static createMockProjectArray(count: number, overrides: Partial<MockProject> = {}): MockProject[] {
    return Array.from({ length: count }, () => this.createMockProject(overrides));
  }

  static resetCounter(): void {
    this.counter = 0;
  }
}

/**
 * Circuit Breaker Pattern Implementation for OmniFocus MCP Server
 *
 * Provides fault tolerance and prevents cascading failures by temporarily
 * blocking operations when repeated failures are detected.
 */

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit */
  threshold: number;

  /** Time in milliseconds before attempting to close the circuit */
  timeout: number;

  /** Function to check if an error should count toward the threshold */
  shouldCountError?: (error: unknown) => boolean;
}

export interface CircuitBreakerState {
  isOpen: boolean;
  isHalfOpen: boolean;
  failureCount: number;
  lastFailureTime: number | null;
  nextAttemptTime: number | null;
}

export class CircuitBreaker {
  private threshold: number;
  private timeout: number;
  private shouldCountError: (error: unknown) => boolean;
  private state: CircuitBreakerState;

  constructor(options: CircuitBreakerOptions) {
    this.threshold = options.threshold;
    this.timeout = options.timeout;
    this.shouldCountError = options.shouldCountError || ((err) => !!err);

    this.state = {
      isOpen: false,
      isHalfOpen: false,
      failureCount: 0,
      lastFailureTime: null,
      nextAttemptTime: null,
    };
  }

  /**
   * Execute an operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state.isOpen) {
      if (this.canAttemptReset()) {
        return this.attemptReset(operation);
      }
      throw new Error('Circuit breaker is open - service temporarily unavailable');
    }

    try {
      const result = await operation();
      this.reset();
      return result;
    } catch (err) {
      if (this.shouldCountError(err)) {
        this.recordFailure();
      }
      throw err;
    }
  }

  /**
   * Check if the circuit breaker is open
   */
  isOpen(): boolean {
    return this.state.isOpen;
  }

  /**
   * Check if the circuit breaker is in half-open state
   */
  isHalfOpen(): boolean {
    return this.state.isHalfOpen;
  }

  /**
   * Get current state of the circuit breaker
   */
  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  /**
   * Reset the circuit breaker state
   */
  reset(): void {
    this.state = {
      isOpen: false,
      isHalfOpen: false,
      failureCount: 0,
      lastFailureTime: null,
      nextAttemptTime: null,
    };
  }

  /**
   * Manually record a failure without throwing an error.
   * Useful when tracking failures from result objects rather than thrown errors.
   */
  recordFailureManually(): void {
    this.recordFailure();
  }

  /**
   * Record a failure and update circuit breaker state
   */
  private recordFailure(): void {
    this.state.failureCount++;
    this.state.lastFailureTime = Date.now();

    if (this.state.failureCount >= this.threshold) {
      this.openCircuit();
    }
  }

  /**
   * Open the circuit to prevent further operations
   */
  private openCircuit(): void {
    this.state.isOpen = true;
    this.state.isHalfOpen = false;
    this.state.nextAttemptTime = Date.now() + this.timeout;
  }

  /**
   * Check if we can attempt to reset the circuit
   */
  private canAttemptReset(): boolean {
    if (!this.state.isOpen || !this.state.nextAttemptTime) {
      return false;
    }

    return Date.now() >= this.state.nextAttemptTime;
  }

  /**
   * Attempt to reset the circuit with a test operation
   */
  private async attemptReset<T>(operation: () => Promise<T>): Promise<T> {
    this.state.isHalfOpen = true;

    try {
      const result = await operation();
      this.reset();
      return result;
    } catch (err) {
      this.state.isHalfOpen = false;
      this.state.nextAttemptTime = Date.now() + this.timeout;
      throw err;
    }
  }
}

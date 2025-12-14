/**
 * Circuit Breaker for LLM API calls
 * Prevents cascade failures when AI service is down
 */

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
  openedAt: number;
}

const state: CircuitBreakerState = {
  failures: 0,
  lastFailureTime: 0,
  isOpen: false,
  openedAt: 0,
};

// Configuration
const CONFIG = {
  FAILURE_THRESHOLD: 3,        // Number of failures before opening circuit
  FAILURE_WINDOW_MS: 2 * 60 * 1000, // 2 minutes window for counting failures
  OPEN_DURATION_MS: 60 * 1000,      // 60 seconds circuit stays open
  LLM_TIMEOUT_MS: 10 * 1000,        // 10 second timeout for LLM calls
};

/**
 * Check if circuit breaker is open (blocking calls)
 */
export function isCircuitOpen(): boolean {
  if (!state.isOpen) return false;
  
  // Check if open duration has passed
  const timeSinceOpen = Date.now() - state.openedAt;
  if (timeSinceOpen >= CONFIG.OPEN_DURATION_MS) {
    // Reset to half-open state (allow one request through)
    state.isOpen = false;
    state.failures = 0;
    return false;
  }
  
  return true;
}

/**
 * Record a successful call (resets failure count)
 */
export function recordSuccess(): void {
  state.failures = 0;
  state.isOpen = false;
}

/**
 * Record a failed call
 */
export function recordFailure(): void {
  const now = Date.now();
  
  // Reset count if outside failure window
  if (now - state.lastFailureTime > CONFIG.FAILURE_WINDOW_MS) {
    state.failures = 0;
  }
  
  state.failures++;
  state.lastFailureTime = now;
  
  // Open circuit if threshold reached
  if (state.failures >= CONFIG.FAILURE_THRESHOLD) {
    state.isOpen = true;
    state.openedAt = now;
    console.warn(`[CircuitBreaker] Circuit OPENED after ${state.failures} failures`);
  }
}

/**
 * Get circuit breaker status for diagnostics
 */
export function getCircuitStatus(): {
  isOpen: boolean;
  failures: number;
  secondsUntilReset: number;
} {
  const secondsUntilReset = state.isOpen
    ? Math.max(0, Math.ceil((CONFIG.OPEN_DURATION_MS - (Date.now() - state.openedAt)) / 1000))
    : 0;
    
  return {
    isOpen: state.isOpen,
    failures: state.failures,
    secondsUntilReset,
  };
}

/**
 * Get LLM timeout configuration
 */
export function getLlmTimeoutMs(): number {
  return CONFIG.LLM_TIMEOUT_MS;
}

/**
 * Wrap a promise with timeout
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
    
    promise
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

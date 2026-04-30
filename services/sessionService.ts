
import { SessionResumptionState, SessionConfig } from '../types';

// --- Gemini 3.1 Flash Live Preview Session Configuration ---

export const SESSION_CONFIG: SessionConfig = {
  model: 'gemini-3.1-flash-live-preview',
  apiVersion: 'v1alpha',
  inputSampleRate: 16000,
  outputSampleRate: 24000,
  audioBufferSize: 1024, // ~64ms at 16kHz — closer to 20-40ms best practice than 4096 (256ms)
  maxReconnectAttempts: 5,
  reconnectBaseDelayMs: 1000,
};

// --- Session Resumption Manager ---

export class SessionResumptionManager {
  private state: SessionResumptionState = {
    handle: null,
    resumable: false,
    lastUpdated: 0,
  };

  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
  }

  /** Update the resumption handle from a SessionResumptionUpdate message */
  updateHandle(newHandle: string, resumable: boolean): void {
    this.state = {
      handle: newHandle,
      resumable,
      lastUpdated: Date.now(),
    };
  }

  /** Get the current handle for reconnection (valid for 2 hours after last session) */
  getHandle(): string | null {
    if (!this.state.handle || !this.state.resumable) return null;

    // Handles are valid for 2 hours after last session termination
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    if (Date.now() - this.state.lastUpdated > TWO_HOURS_MS) {
      this.clear();
      return null;
    }

    return this.state.handle;
  }

  /** Check if we can resume a previous session */
  canResume(): boolean {
    return this.getHandle() !== null;
  }

  /** Clear the resumption state (e.g., on explicit session end) */
  clear(): void {
    this.state = {
      handle: null,
      resumable: false,
      lastUpdated: 0,
    };
  }

  /** Get the stable session ID */
  getSessionId(): string {
    return this.sessionId;
  }

  /** Reset the session ID (e.g., when starting a brand new session) */
  resetSessionId(): void {
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`.toUpperCase();
  }
}

// --- Reconnection Logic ---

export class ReconnectionManager {
  private attempts = 0;
  private maxAttempts: number;
  private baseDelayMs: number;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    maxAttempts: number = SESSION_CONFIG.maxReconnectAttempts,
    baseDelayMs: number = SESSION_CONFIG.reconnectBaseDelayMs,
  ) {
    this.maxAttempts = maxAttempts;
    this.baseDelayMs = baseDelayMs;
  }

  /** Schedule a reconnection attempt with exponential backoff */
  scheduleReconnect(callback: () => void): boolean {
    if (this.attempts >= this.maxAttempts) {
      return false; // Max attempts reached
    }

    // Exponential backoff with jitter: delay = baseDelay * 2^attempts + random(0..500)
    const delay = this.baseDelayMs * Math.pow(2, this.attempts) + Math.random() * 500;
    this.attempts++;

    this.timeoutId = setTimeout(callback, delay);
    return true;
  }

  /** Reset the reconnection counter (e.g., after a successful connection) */
  reset(): void {
    this.attempts = 0;
    this.cancelPending();
  }

  /** Cancel any pending reconnection */
  cancelPending(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /** Get the current attempt count */
  getAttempts(): number {
    return this.attempts;
  }

  /** Check if max attempts have been exhausted */
  isExhausted(): boolean {
    return this.attempts >= this.maxAttempts;
  }
}

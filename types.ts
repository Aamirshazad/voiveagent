
export enum LearningModule {
  PRONUNCIATION = 'American Pronunciation',
  CONVERSATION = 'Conversation Practice',
  GRAMMAR_VOCAB = 'Grammar & Vocabulary',
  BUSINESS_ENGLISH = 'Business English',
  TEST_PREP = 'IELTS/TOEFL Prep',
  ACCENT_REDUCTION = 'Accent Reduction'
}

export enum DifficultyLevel {
  BEGINNER = 'Beginner',
  INTERMEDIATE = 'Intermediate',
  ADVANCED = 'Advanced'
}

export type Scenario = string;

export interface TranscriptionEntry {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface FeedbackEntry {
  type: 'pronunciation' | 'grammar' | 'vocabulary' | 'fluency';
  severity: 'error' | 'warning' | 'tip';
  message: string;
  timestamp: number;
}

export interface LearningProgress {
  sessionDuration: number;
  wordsSpoken: number;
  pronunciationScore: number;
  vocabularyLearned: string[];
  lessonsCompleted: number;
}

export interface AudioConfig {
  sampleRate: number;
  channels: number;
}

// --- Gemini 3.1 Live API Session Management Types ---

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
}

export interface SessionResumptionState {
  handle: string | null;
  resumable: boolean;
  lastUpdated: number;
}

export interface SessionConfig {
  model: string;
  apiVersion: string;
  inputSampleRate: number;
  outputSampleRate: number;
  audioBufferSize: number;
  maxReconnectAttempts: number;
  reconnectBaseDelayMs: number;
}

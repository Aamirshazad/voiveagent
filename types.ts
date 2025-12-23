
export enum Scenario {
  CASUAL = 'Casual Conversation',
  JOB_INTERVIEW = 'Job Interview',
  TECH_PITCH = 'Startup Pitch',
  COFFEE_SHOP = 'Ordering Coffee',
  AIRPORT = 'Airport Check-in',
  ACCENT_CLINIC = 'Accent Clinic (Intensive)'
}

export interface TranscriptionEntry {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface AudioConfig {
  sampleRate: number;
  channels: number;
}

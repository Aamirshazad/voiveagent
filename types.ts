
export enum LearningModule {
  SALES_PRESENCE = 'Sales Clarity & Accent',
  PRODUCT_PITCH = 'AI Product Pitching',
  BIZ_DEV = 'Strategic Partnerships',
  PM_STRATEGY = 'Tech-to-Biz Translation',
  NEGOTIATION = 'Deal Logic & Closing',
  LEADERSHIP = 'Executive Influence'
}

export type Scenario = string;

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

export enum Role {
  USER = 'user',
  MODEL = 'model'
}

export interface Message {
  id: string;
  role: Role;
  text: string;
  timestamp: number;
}

export interface NPCConfig {
  name: string;
  relationship: string;
  personality: string;
  speakingStyle: string;
  learningGoals: string[];
  avatarImage?: string;
  voiceName: string;
}

export const RELATIONSHIP_OPTIONS = [
  "Friend",
  "Roommate",
  "English Coach",
  "Crush",
  "Coworker",
  "Sibling",
  "Stranger at a Bar",
  "Strict Teacher"
];

export const PERSONALITY_OPTIONS = [
  "Kind & Supportive",
  "Tsundere (Cold then warm)",
  "Serious & Professional",
  "Sarcastic & Witty",
  "Energetic & Hyper",
  "Chill & Laid-back"
];

export const SPEAKING_STYLE_OPTIONS = [
  "Polite (Standard)",
  "Casual (Everyday)",
  "Slang Heavy",
  "Slow & Simple (Beginner)",
  "Fast & Complex (Advanced)"
];

export const LEARNING_GOAL_OPTIONS = [
  "Daily Conversation",
  "Study Abroad Prep",
  "Travel English",
  "Exam Prep (TOEIC/TOEFL)",
  "Business English",
  "Slang & Culture"
];

export const VOICE_OPTIONS = [
  { id: 'Kore', label: '女性 - 落ち着いた声 (Standard US Female)' },
  { id: 'Zephyr', label: '女性 - 明るい声 (Bright US Female)' },
  { id: 'Puck', label: '男性 - 遊び心のある声 (Playful Male)' },
  { id: 'Fenrir', label: '男性 - エネルギッシュ (Energetic Male)' },
  { id: 'Charon', label: '男性 - 低音・渋め (Deep Male)' }
];
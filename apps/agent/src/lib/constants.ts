export const APP_NAME = 'PocketSage';
export const APP_VERSION = '0.1.0';
export const APP_SCHEME = 'pocketsage';

export const DEFAULT_MODEL_TIER = 'fast' as const;
export const MAX_FREE_CONVERSATIONS = 200;
export const MAX_STREAMING_TOKENS = 4096;
export const DEFAULT_GENERATION_TIMEOUT_MS = 30_000;
export const MAX_AGENT_STEPS = 10;

export const SKILL_NAMES = ['calendar', 'reminders', 'health', 'files', 'contacts'] as const;
export type SkillName = (typeof SKILL_NAMES)[number];

export const STORAGE_KEYS = {
  ENABLED_SKILLS: 'pocketsage:enabled-skills',
  TOOL_PERMISSIONS: 'pocketsage:tool-permissions',
  VECTOR_STORE: 'vector-store.json',
  GLOBAL_MEMORY: 'GLOBAL.md',
  ACTIVE_MODEL_ID: 'pocketsage:active-model-id',
  ONBOARDING_COMPLETE: 'pocketsage:onboarding-complete',
  CONVERSATIONS: 'pocketsage:conversations',
} as const;

export const MODEL_DOWNLOAD_DIR = 'react-native-executorch';

export const SUGGESTED_PROMPTS = [
  "What's on my calendar today?",
  'Remember my favorite coffee order is a flat white',
  'How many steps did I get this week?',
  'Add a reminder to call Mom at 3pm',
  'Find the document I was working on last week',
] as const;

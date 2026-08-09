import { create } from 'zustand';
import type { Skill, SkillMetadata, ToolDefinition } from '@pocketsage/agent-runtime';
import { skillRegistry } from '@pocketsage/agent-runtime';
import { readJson, writeJson } from '@/lib/persistence';
import { STORAGE_KEYS, SKILL_NAMES } from '@/lib/constants';
import { calendarSkill } from '@/skills/calendar/skill';
import { remindersSkill } from '@/skills/reminders/skill';
import { healthSkill } from '@/skills/health/skill';
import { filesSkill } from '@/skills/files/skill';
import { contactsSkill } from '@/skills/contacts/skill';

export type ToolPermission = 'ask' | 'always_allow' | 'deny';

interface SkillState {
  skills: Skill[];
  enabledSkills: Set<string>;
  toolPermissions: Record<string, ToolPermission>;
  isInitialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  loadBundledSkills: () => void;
  toggleSkill: (name: string, enabled: boolean) => void;
  setToolPermission: (toolName: string, permission: ToolPermission) => void;

  // Derived
  getEnabledSkillsMetadata: () => SkillMetadata[];
  getEnabledTools: () => ToolDefinition[];
}

// ── Bundled skills ──────────────────────────────────────────────────────────────

const BUNDLED_SKILLS: Skill[] = [
  calendarSkill,
  remindersSkill,
  healthSkill,
  filesSkill,
  contactsSkill,
];

// ── Store ──────────────────────────────────────────────────────────────────────

export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],
  enabledSkills: new Set<string>(),
  toolPermissions: {},
  isInitialized: false,

  initialize: async () => {
    // Load persisted state first so user preferences survive restarts.
    const enabled = await readJson<string[]>(STORAGE_KEYS.ENABLED_SKILLS, SKILL_NAMES);
    const permissions = await readJson<Record<string, ToolPermission>>(
      STORAGE_KEYS.TOOL_PERMISSIONS,
      {},
    );
    set({ enabledSkills: new Set(enabled), toolPermissions: permissions });
    get().loadBundledSkills();
    set({ isInitialized: true });
  },

  loadBundledSkills: () => {
    const registered: Skill[] = [];
    for (const skill of BUNDLED_SKILLS) {
      skillRegistry.register(skill);
      registered.push(skill);
    }
    set({ skills: registered });
  },

  toggleSkill: (name, enabled) => {
    const next = new Set(get().enabledSkills);
    if (enabled) {
      next.add(name);
    } else {
      next.delete(name);
    }
    set({ enabledSkills: next });
    void writeJson(STORAGE_KEYS.ENABLED_SKILLS, Array.from(next));
  },

  setToolPermission: (toolName, permission) => {
    const next = { ...get().toolPermissions, [toolName]: permission };
    set({ toolPermissions: next });
    void writeJson(STORAGE_KEYS.TOOL_PERMISSIONS, next);
  },

  getEnabledSkillsMetadata: () => {
    const { skills, enabledSkills } = get();
    return skills
      .filter((skill) => enabledSkills.has(skill.metadata.name))
      .map((skill) => ({ ...skill.metadata }));
  },

  getEnabledTools: () => {
    const { enabledSkills } = get();
    return skillRegistry.getToolsForSkills(enabledSkills);
  },
}));

export type SkillStore = typeof useSkillStore;

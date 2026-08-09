import { create } from 'zustand';
import type { Skill, SkillMetadata, ToolDefinition } from '@pocketsage/agent-runtime';
import { skillRegistry } from '@pocketsage/agent-runtime';

export type SkillStore = ReturnType<typeof createSkillStore>;

function createSkillStore() {
  return create<{
    skills: Skill[];
    enabledSkills: Set<string>;
    toolPermissions: Record<string, 'ask' | 'always_allow' | 'deny'>;

    loadBundledSkill: (skill: Skill) => void;
    toggleSkill: (name: string, enabled: boolean) => void;
    setToolPermission: (
      toolName: string,
      permission: 'ask' | 'always_allow' | 'deny',
    ) => void;
    getEnabledSkillsMetadata: () => SkillMetadata[];
    getEnabledTools: () => ToolDefinition[];
  }>((set, get) => ({
    skills: [],
    enabledSkills: new Set(['calendar', 'reminders', 'health', 'files', 'contacts']),
    toolPermissions: {},

    loadBundledSkill: (skill) => {
      skillRegistry.register(skill);
      set((s) => ({
        skills: [...s.skills.filter((sk) => sk.metadata.name !== skill.metadata.name), skill],
      }));
    },

    toggleSkill: (name, enabled) => {
      set((s) => {
        const next = new Set(s.enabledSkills);
        if (enabled) next.add(name);
        else next.delete(name);
        return { enabledSkills: next };
      });
    },

    setToolPermission: (toolName, permission) => {
      set((s) => ({
        toolPermissions: { ...s.toolPermissions, [toolName]: permission },
      }));
    },

    getEnabledSkillsMetadata: () => {
      const { skills, enabledSkills } = get();
      return skills
        .filter((s) => enabledSkills.has(s.metadata.name))
        .map((s) => ({ ...s.metadata }));
    },

    getEnabledTools: () => {
      const { enabledSkills } = get();
      return skillRegistry.getToolsForSkills(enabledSkills);
    },
  }));
}

export const useSkillStore = createSkillStore();

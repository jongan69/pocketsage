import { useCallback } from 'react';
import type { SkillMetadata, SkillToolDefinition } from '@pocketsage/agent-runtime';
import { useSkillStore } from '@/stores/skill-store';
import type { ToolPermission } from '@/stores/skill-store';

/**
 * React bindings for the skill store. Derived values come from subscribed
 * state; actions are stable references backed by getState().
 */
export function useSkills() {
  const skills = useSkillStore((s) => s.skills);
  const enabledSkills = useSkillStore((s) => s.enabledSkills);
  const toolPermissions = useSkillStore((s) => s.toolPermissions);
  const isInitialized = useSkillStore((s) => s.isInitialized);

  const toggleSkill = useCallback(
    (name: string, enabled: boolean) => useSkillStore.getState().toggleSkill(name, enabled),
    [],
  );
  const setToolPermission = useCallback(
    (toolName: string, permission: ToolPermission) =>
      useSkillStore.getState().setToolPermission(toolName, permission),
    [],
  );
  const isEnabled = useCallback(
    (name: string) => useSkillStore.getState().enabledSkills.has(name),
    [],
  );
  const getEnabledSkillsMetadata = useCallback(
    (): SkillMetadata[] => useSkillStore.getState().getEnabledSkillsMetadata(),
    [],
  );
  const getEnabledTools = useCallback(
    (): SkillToolDefinition[] => useSkillStore.getState().getEnabledTools(),
    [],
  );

  return {
    skills,
    enabledSkills,
    toolPermissions,
    isInitialized,
    toggleSkill,
    setToolPermission,
    isEnabled,
    getEnabledSkillsMetadata,
    getEnabledTools,
  };
}

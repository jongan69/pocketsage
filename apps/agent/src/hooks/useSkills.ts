import { useSkillStore } from '@/stores/skill-store';

export function useSkills() {
  const store = useSkillStore();

  return {
    skills: store.skills,
    enabledSkills: store.enabledSkills,
    toggleSkill: store.toggleSkill,
    isEnabled: (name: string) => store.enabledSkills.has(name),
    loadBundledSkill: store.loadBundledSkill,
  };
}

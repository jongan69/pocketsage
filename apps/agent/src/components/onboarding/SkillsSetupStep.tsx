import React, { useEffect } from 'react';
import { View, Text, Switch } from 'react-native';
import { useSkillStore } from '@/stores/skill-store';
import { skillDisplayName } from '@/components/skills/SkillIcon';

const EMOJI_BY_SKILL: Record<string, string> = {
  calendar: '📅',
  reminders: '🔔',
  health: '❤️',
  files: '📁',
  contacts: '👤',
};

/** Onboarding step 3: enable the bundled skills (all on by default). */
export function SkillsSetupStep() {
  const { skills, enabledSkills, loadBundledSkills, toggleSkill } = useSkillStore();

  // Load bundled skills, then default every skill to enabled.
  useEffect(() => {
    if (skills.length === 0) {
      loadBundledSkills();
      return;
    }
    if (enabledSkills.size === 0) {
      for (const skill of skills) {
        toggleSkill(skill.metadata.name, true);
      }
    }
  }, [skills, enabledSkills, loadBundledSkills, toggleSkill]);

  return (
    <View className="flex-1 justify-center pb-6">
      <Text className="text-text-primary text-3xl font-bold text-center leading-tight">
        Enable skills
      </Text>
      <Text className="text-text-secondary text-base text-center leading-relaxed mt-3 px-2 mb-6">
        Let PocketSage help with calendar, reminders, health data, files, and contacts.
      </Text>

      <View className="gap-2.5">
        {skills.map((skill) => {
          const name = skill.metadata.name;
          const enabled = enabledSkills.has(name);
          return (
            <View key={name} className="bg-surface-secondary rounded-xl px-4 py-3 flex-row items-center">
              <Text className="text-xl mr-3">{EMOJI_BY_SKILL[name] ?? '🧩'}</Text>
              <View className="flex-1">
                <Text className="text-text-primary font-semibold text-sm">
                  {skillDisplayName(name)}
                </Text>
                <Text className="text-text-muted text-xs mt-0.5" numberOfLines={1}>
                  {skill.metadata.description}
                </Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={(value) => toggleSkill(name, value)}
                trackColor={{ false: '#1c1c1c', true: '#6366f1' }}
                thumbColor="#f5f5f5"
                ios_backgroundColor="#1c1c1c"
              />
            </View>
          );
        })}

        {skills.length === 0 && (
          <Text className="text-text-muted text-sm text-center py-4">
            Skills will appear here after setup.
          </Text>
        )}
      </View>
    </View>
  );
}

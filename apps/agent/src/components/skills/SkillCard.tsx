import React from 'react';
import { View, Text, Pressable, Switch } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { SkillMetadata } from '@pocketsage/agent-runtime';
import { skillIconFor, skillColorFor, skillDisplayName } from './SkillIcon';

interface SkillCardProps {
  skill: SkillMetadata;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onPress: () => void;
}

export const SkillCard = React.memo(function SkillCard({
  skill,
  enabled,
  onToggle,
  onPress,
}: SkillCardProps) {
  const Icon = skillIconFor(skill.name);
  const color = skillColorFor(skill.name);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${skillDisplayName(skill.name)} skill`}
      className="bg-surface-secondary rounded-xl p-4 mb-3 flex-row items-center active:opacity-80"
    >
      {/* Icon */}
      <View className="w-11 h-11 rounded-xl bg-surface-tertiary items-center justify-center mr-3">
        <Icon size={20} color={color} />
      </View>

      {/* Name + description */}
      <View className="flex-1 mr-2">
        <Text className="text-text-primary font-semibold text-base">
          {skillDisplayName(skill.name)}
        </Text>
        <Text className="text-text-secondary text-sm mt-0.5" numberOfLines={2}>
          {skill.description}
        </Text>
      </View>

      {/* Toggle + chevron */}
      <Switch
        value={enabled}
        onValueChange={onToggle}
        trackColor={{ false: '#1c1c1c', true: '#6366f1' }}
        thumbColor="#f5f5f5"
        ios_backgroundColor="#1c1c1c"
      />
      <ChevronRight size={18} color="#525252" className="ml-1" />
    </Pressable>
  );
});

export type { SkillCardProps };

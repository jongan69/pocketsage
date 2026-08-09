import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import type { ToolCall } from '@pocketsage/agent-runtime';
import { useSkillStore } from '@/stores/skill-store';
import { Button } from '@/components/ui/Button';
import { skillIconFor, skillColorFor, skillDisplayName } from '@/components/skills/SkillIcon';

interface ToolConfirmationProps {
  visible: boolean;
  toolCall: ToolCall | null;
  /** Skill the tool belongs to; may be empty — falls back to the tool name. */
  skillName: string;
  onConfirm: () => void;
  onDeny: () => void;
}

/** Bottom sheet asking the user to approve a tool call, with always-allow. */
export const ToolConfirmation = React.memo(function ToolConfirmation({
  visible,
  toolCall,
  skillName,
  onConfirm,
  onDeny,
}: ToolConfirmationProps) {
  const { skills, setToolPermission } = useSkillStore();
  const [alwaysAllow, setAlwaysAllow] = useState(false);

  // Reset the checkbox whenever a new tool call arrives.
  useEffect(() => {
    setAlwaysAllow(false);
  }, [toolCall?.id]);

  if (!toolCall) return null;

  const displaySkill = skillName || toolCall.name.split('.')[0];
  const Icon = skillIconFor(displaySkill);
  const color = skillColorFor(displaySkill);
  const skill = skills.find((s) => s.metadata.name === displaySkill);

  const handleConfirm = () => {
    if (alwaysAllow) {
      setToolPermission(toolCall.name, 'always_allow');
    }
    onConfirm();
  };

  const hasArguments = Object.keys(toolCall.arguments).length > 0;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDeny}>
      <View className="flex-1 bg-black/70 justify-end">
        <Pressable className="flex-1" onPress={onDeny} accessibilityLabel="Deny and close" />

        <Animated.View
          entering={SlideInDown.springify().damping(16).stiffness(200)}
          className="bg-surface-secondary rounded-t-3xl px-6 pt-6 pb-10"
        >
          {/* Icon */}
          <View className="w-14 h-14 rounded-2xl bg-surface-tertiary items-center justify-center self-center mb-4">
            <Icon size={28} color={color} />
          </View>

          <Text className="text-text-primary text-lg font-bold text-center mb-2">
            Allow PocketSage to use {skillDisplayName(displaySkill)}?
          </Text>

          <Text className="text-text-secondary text-sm text-center font-mono mb-1">
            {toolCall.name}
          </Text>

          {skill && (
            <Text className="text-text-muted text-xs text-center mb-4 px-2" numberOfLines={2}>
              {skill.metadata.description}
            </Text>
          )}

          {/* Arguments */}
          {hasArguments && (
            <View className="bg-surface rounded-xl p-3 mb-5">
              <Text className="text-text-muted text-xs font-semibold uppercase mb-2">Details</Text>
              {Object.entries(toolCall.arguments).map(([key, value]) => (
                <View key={key} className="flex-row justify-between py-1">
                  <Text className="text-text-secondary text-sm">{key}</Text>
                  <Text className="text-text-primary text-sm font-medium ml-3" numberOfLines={1}>
                    {typeof value === 'string' ? value : JSON.stringify(value)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Always allow */}
          <Pressable
            onPress={() => setAlwaysAllow((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: alwaysAllow }}
            className="flex-row items-center justify-center py-2 mb-4"
          >
            <View
              className={`w-5 h-5 rounded-md border-2 items-center justify-center mr-2.5 ${
                alwaysAllow ? 'bg-accent border-accent' : 'border-text-muted'
              }`}
            >
              {alwaysAllow && <Check size={12} color="#ffffff" />}
            </View>
            <Text className="text-text-secondary text-sm">
              Always allow {skillDisplayName(displaySkill)}
            </Text>
          </Pressable>

          {/* Buttons */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button variant="secondary" onPress={onDeny} className="w-full">
                Deny
              </Button>
            </View>
            <View className="flex-1">
              <Button variant="primary" onPress={handleConfirm} className="w-full">
                Allow
              </Button>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
});

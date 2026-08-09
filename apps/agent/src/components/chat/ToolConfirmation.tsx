import React from 'react';
import { View, Text, Modal, Pressable } from 'react-native';
import { Calendar, Bell, Heart, File, User, Shield } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import type { ToolCall } from '@pocketsage/agent-runtime';

interface ToolConfirmationProps {
  visible: boolean;
  toolCall: ToolCall | null;
  skillName: string;
  onConfirm: () => void;
  onDeny: () => void;
}

const skillIcons: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  calendar: Calendar,
  reminders: Bell,
  health: Heart,
  files: File,
  contacts: User,
};

export const ToolConfirmation = React.memo(function ToolConfirmation({
  visible,
  toolCall,
  skillName,
  onConfirm,
  onDeny,
}: ToolConfirmationProps) {
  if (!toolCall) return null;

  const Icon = skillIcons[skillName] ?? Shield;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View className="flex-1 bg-black/70 justify-end">
        <Pressable className="flex-1" onPress={onDeny} />
        <View className="bg-surface-secondary rounded-t-3xl px-6 pt-6 pb-10">
          {/* Icon */}
          <View className="w-14 h-14 bg-accent/20 rounded-2xl items-center justify-center self-center mb-4">
            <Icon size={28} color="#6366f1" />
          </View>

          <Text className="text-text-primary text-lg font-bold text-center mb-2">
            Allow PocketSage to use {skillName || toolCall.name}?
          </Text>

          <Text className="text-text-secondary text-sm text-center mb-4">
            {toolCall.name}
          </Text>

          {/* Arguments */}
          {Object.keys(toolCall.arguments).length > 0 && (
            <View className="bg-surface rounded-xl p-3 mb-5">
              <Text className="text-text-muted text-xs font-semibold uppercase mb-2">
                Details
              </Text>
              {Object.entries(toolCall.arguments).map(([key, value]) => (
                <View key={key} className="flex-row justify-between py-1">
                  <Text className="text-text-secondary text-sm">{key}</Text>
                  <Text className="text-text-primary text-sm font-medium" numberOfLines={1}>
                    {typeof value === 'string' ? value : JSON.stringify(value)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Buttons */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button variant="secondary" onPress={onDeny} className="w-full">
                Deny
              </Button>
            </View>
            <View className="flex-1">
              <Button variant="primary" onPress={onConfirm} className="w-full">
                Allow
              </Button>
            </View>
          </View>

          {/* Always allow */}
          <Pressable className="mt-4 items-center py-2">
            <Text className="text-text-muted text-sm">
              Always allow this skill
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
});

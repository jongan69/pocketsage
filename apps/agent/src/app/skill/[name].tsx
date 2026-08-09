import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { X, Calendar, Bell, Heart, File, User, Shield } from 'lucide-react-native';
import { useSkillStore } from '@/stores/skill-store';

const skillIcons: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  calendar: Calendar,
  reminders: Bell,
  health: Heart,
  files: File,
  contacts: User,
};

export default function SkillDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const { skills, enabledSkills, toggleSkill } = useSkillStore();
  const skill = skills.find((s) => s.metadata.name === name);
  const enabled = enabledSkills.has(name ?? '');

  if (!skill) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center">
        <Text className="text-text-secondary">Skill not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-accent">Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const Icon = skillIcons[name ?? ''] ?? Shield;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-surface-tertiary">
        <Pressable onPress={() => router.back()} className="p-2">
          <X size={22} color="#a3a3a3" />
        </Pressable>
        <Text className="text-text-primary font-semibold text-lg">{skill.metadata.description}</Text>
        <Pressable
          onPress={() => toggleSkill(name!, !enabled)}
          className={`px-4 py-1.5 rounded-full ${enabled ? 'bg-accent' : 'bg-surface-tertiary'}`}
        >
          <Text className={`text-sm font-semibold ${enabled ? 'text-white' : 'text-text-secondary'}`}>
            {enabled ? 'Enabled' : 'Disabled'}
          </Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Icon + name */}
        <View className="items-center py-6">
          <View className="w-16 h-16 bg-accent/20 rounded-2xl items-center justify-center mb-3">
            <Icon size={32} color="#6366f1" />
          </View>
          <Text className="text-text-primary text-xl font-bold">{skill.metadata.description}</Text>
          <Text className="text-text-muted text-sm mt-1">v{skill.metadata.version}</Text>
        </View>

        {/* Tools */}
        <Text className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3 ml-1">
          Tools ({Object.keys(skill.tools).length})
        </Text>
        {Object.entries(skill.tools).map(([toolName, tool]) => (
          <View key={toolName} className="bg-surface-secondary rounded-xl p-4 mb-2">
            <Text className="text-text-primary font-semibold text-sm mb-1">{toolName}</Text>
            <Text className="text-text-secondary text-sm mb-2">{tool.definition.description}</Text>
            {Object.keys(tool.definition.parameters.properties).length > 0 && (
              <View className="bg-surface rounded-lg p-3">
                <Text className="text-text-muted text-xs mb-2">Parameters</Text>
                {Object.entries(tool.definition.parameters.properties).map(([param, schema]) => (
                  <View key={param} className="flex-row justify-between py-1">
                    <Text className="text-text-secondary text-xs font-mono">
                      {param}
                      {tool.definition.parameters.required.includes(param) ? ' *' : ''}
                    </Text>
                    <Text className="text-text-muted text-xs">{schema.type}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        {/* Triggers */}
        {skill.metadata.triggers.length > 0 && (
          <>
            <Text className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3 mt-4 ml-1">
              When this activates
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {skill.metadata.triggers.map((t, i) => (
                <View key={i} className="bg-surface-tertiary rounded-full px-3 py-1.5">
                  <Text className="text-text-secondary text-xs">{t}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

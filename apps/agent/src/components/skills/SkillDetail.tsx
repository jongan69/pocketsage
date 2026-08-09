import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { X, ChevronDown, ChevronUp, ShieldAlert, Lock } from 'lucide-react-native';
import { useSkillStore } from '@/stores/skill-store';
import { Badge } from '@/components/ui/Badge';
import { skillIconFor, skillColorFor, skillDisplayName } from './SkillIcon';

interface SkillDetailProps {
  /** Skill id (metadata.name), e.g. "calendar". */
  skillName: string;
}

const INSTRUCTIONS_PREVIEW_LENGTH = 200;

/** Detailed view of a single skill: tools, parameters, triggers, instructions. */
export function SkillDetail({ skillName }: SkillDetailProps) {
  const { skills, enabledSkills, toggleSkill } = useSkillStore();
  const [instructionsExpanded, setInstructionsExpanded] = useState(false);

  const skill = skills.find((s) => s.metadata.name === skillName);
  const enabled = enabledSkills.has(skillName);

  const close = () => router.back();

  // ── Not found state ────────────────────────────────────────────────────────
  if (!skill) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center px-8">
        <View className="w-14 h-14 rounded-2xl bg-surface-tertiary items-center justify-center mb-4">
          <ShieldAlert size={26} color="#a3a3a3" />
        </View>
        <Text className="text-text-primary font-semibold text-base mb-1">Skill not found</Text>
        <Text className="text-text-secondary text-sm text-center mb-6">
          "{skillName}" isn't available on this device.
        </Text>
        <Pressable onPress={close} className="px-4 py-2">
          <Text className="text-accent font-semibold">Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const Icon = skillIconFor(skillName);
  const color = skillColorFor(skillName);
  const toolEntries = Object.entries(skill.tools);
  const instructions = (skill.instructions ?? '').trim();
  const showInstructions = instructions.length > 0;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-surface-tertiary">
        <Pressable onPress={close} accessibilityLabel="Close" className="p-2 -ml-2">
          <X size={22} color="#a3a3a3" />
        </Pressable>
        <Text className="text-text-primary font-semibold text-lg">Skill details</Text>
        <Switch
          value={enabled}
          onValueChange={(value) => toggleSkill(skillName, value)}
          trackColor={{ false: '#1c1c1c', true: '#6366f1' }}
          thumbColor="#f5f5f5"
          ios_backgroundColor="#1c1c1c"
        />
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 48 }}>
        {/* Icon + name */}
        <View className="flex-row items-center py-5">
          <View className="w-14 h-14 rounded-2xl bg-surface-tertiary items-center justify-center mr-4">
            <Icon size={26} color={color} />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-text-primary text-xl font-bold">
                {skillDisplayName(skillName)}
              </Text>
              <Badge variant="default">v{skill.metadata.version}</Badge>
            </View>
            <Text className="text-text-secondary text-sm mt-1">{skill.metadata.description}</Text>
          </View>
        </View>

        {/* Triggers */}
        {skill.metadata.triggers.length > 0 && (
          <>
            <SectionTitle>When this skill activates</SectionTitle>
            <View className="flex-row flex-wrap gap-2 mb-1">
              {skill.metadata.triggers.map((trigger, i) => (
                <View key={i} className="bg-surface-tertiary rounded-full px-3 py-1.5">
                  <Text className="text-text-secondary text-xs">{trigger}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Tools */}
        <SectionTitle>Tools ({toolEntries.length})</SectionTitle>
        {toolEntries.map(([toolName, tool]) => (
          <View key={toolName} className="bg-surface-secondary rounded-xl p-4 mb-3">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-text-primary font-semibold font-mono text-sm">{toolName}</Text>
              {tool.definition.requiresConfirmation && (
                <Badge variant="warning">
                  <View className="flex-row items-center">
                    <Lock size={10} color="#f59e0b" className="mr-1" />
                    Needs approval
                  </View>
                </Badge>
              )}
            </View>
            <Text className="text-text-secondary text-sm mb-3">{tool.definition.description}</Text>

            {/* Parameters */}
            {Object.keys(tool.definition.parameters.properties).length > 0 && (
              <View className="bg-surface rounded-lg p-3">
                <Text className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2">
                  Parameters
                </Text>
                {Object.entries(tool.definition.parameters.properties).map(([param, schema]) => {
                  const required = tool.definition.parameters.required.includes(param);
                  return (
                    <View key={param} className="flex-row items-center justify-between py-1">
                      <View className="flex-row items-center flex-1 mr-2">
                        <Text className="text-text-secondary text-xs font-mono mr-2">{param}</Text>
                        <Badge variant={required ? 'success' : 'default'}>
                          {required ? 'required' : 'optional'}
                        </Badge>
                      </View>
                      <Text className="text-text-muted text-xs">{schema.type}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ))}

        {/* Instructions */}
        {showInstructions && (
          <>
            <SectionTitle>Instructions</SectionTitle>
            <View className="bg-surface-secondary rounded-xl p-4 mb-3">
              <Text className="text-text-secondary text-sm leading-relaxed">
                {instructionsExpanded || instructions.length <= INSTRUCTIONS_PREVIEW_LENGTH
                  ? instructions
                  : `${instructions.slice(0, INSTRUCTIONS_PREVIEW_LENGTH)}…`}
              </Text>
              {instructions.length > INSTRUCTIONS_PREVIEW_LENGTH && (
                <Pressable
                  onPress={() => setInstructionsExpanded((v) => !v)}
                  className="flex-row items-center mt-3 self-start"
                >
                  <Text className="text-accent text-sm font-medium mr-1">
                    {instructionsExpanded ? 'Show less' : 'Show more'}
                  </Text>
                  {instructionsExpanded ? (
                    <ChevronUp size={16} color="#6366f1" />
                  ) : (
                    <ChevronDown size={16} color="#6366f1" />
                  )}
                </Pressable>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2 mt-4 ml-1">
      {children}
    </Text>
  );
}

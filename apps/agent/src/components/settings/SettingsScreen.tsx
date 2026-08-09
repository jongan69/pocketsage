import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Share, Linking } from 'react-native';
import { File, Paths } from 'expo-file-system';
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Trash2,
  Share2,
  MessageSquare,
  HardDrive,
  ShieldCheck,
  GitBranch,
  Scale,
  FileText,
  Sparkles,
} from 'lucide-react-native';
import { APP_VERSION } from '@/lib/constants';
import { useModels } from '@/hooks/useModels';
import { useConversationStore } from '@/stores/conversation-store';
import { useMemoryStore } from '@/stores/memory-store';
import { useSkillStore } from '@/stores/skill-store';
import type { ToolPermission } from '@/stores/skill-store';
import { Badge } from '@/components/ui/Badge';
import { ModelPicker } from '@/components/models/ModelPicker';
import { skillIconFor, skillColorFor, skillDisplayName } from '@/components/skills/SkillIcon';

function formatSize(bytes: number): string {
  const gb = bytes / 1_000_000_000;
  return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
}

const NEXT_PERMISSION: Record<ToolPermission, ToolPermission> = {
  ask: 'always_allow',
  always_allow: 'deny',
  deny: 'ask',
};

const PERMISSION_META: Record<
  ToolPermission,
  { label: string; dotColor: string; textClass: string }
> = {
  ask: { label: 'Ask', dotColor: '#f59e0b', textClass: 'text-warning' },
  always_allow: { label: 'Always allow', dotColor: '#22c55e', textClass: 'text-success' },
  deny: { label: 'Deny', dotColor: '#ef4444', textClass: 'text-danger' },
};

const ABOUT_LINKS = [
  { key: 'privacy', label: 'Privacy Policy', icon: FileText, url: 'https://pocketsage.app/privacy' },
  { key: 'github', label: 'GitHub', icon: GitBranch, url: 'https://github.com/jonathangan/pocketsage' },
  {
    key: 'licenses',
    label: 'Licenses',
    icon: Scale,
    url: 'https://github.com/jonathangan/pocketsage/blob/main/LICENSE',
  },
];

/** Full settings screen: model, memory, skill permissions, and about. */
export function SettingsScreen() {
  const models = useModels();
  const conversation = useConversationStore();
  const memory = useMemoryStore();
  const skills = useSkillStore();

  const [pickerVisible, setPickerVisible] = useState(false);
  const [howExpanded, setHowExpanded] = useState(false);

  const activeModel = models.activeModel;
  const modelState = activeModel ? models.downloadState(activeModel.id) : null;

  const conversationsCount = conversation.conversations.length;
  const factsCount = memory.persistentFacts.length;
  const memoryEmpty = conversationsCount === 0 && factsCount === 0;

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Could not open link', url);
    });
  };

  const handleExportMemories = async () => {
    try {
      const json = await memory.exportMemories();
      const file = new File(Paths.cache, 'pocketsage-memories.json');
      await file.write(json);
      await Share.share({
        url: file.uri,
        message: 'PocketSage memories export',
      });
    } catch (error) {
      Alert.alert(
        'Export failed',
        error instanceof Error ? error.message : 'Could not export memories.',
      );
    }
  };

  const handleClearMemories = () => {
    Alert.alert(
      'Clear all memories?',
      'This permanently deletes all conversations and remembered facts. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            for (const c of conversation.conversations) conversation.deleteConversation(c.id);
            void memory.clearAll();
          },
        },
      ],
    );
  };

  const modelStatusBadge = (() => {
    if (!activeModel || !modelState) return <Badge variant="default">No model</Badge>;
    switch (modelState.status) {
      case 'downloaded':
        return <Badge variant="success">Downloaded</Badge>;
      case 'downloading':
        return (
          <Badge variant="warning">
            Downloading {Math.round((modelState.progress ?? 0) * 100)}%
          </Badge>
        );
      case 'error':
        return <Badge variant="danger">Failed</Badge>;
      default:
        return <Badge variant="default">Not downloaded</Badge>;
    }
  })();

  return (
    <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 48 }}>
      {/* Header */}
      <View className="flex-row items-center pt-4 pb-2">
        <View className="w-10 h-10 rounded-xl bg-accent/20 items-center justify-center mr-3">
          <Sparkles size={20} color="#6366f1" />
        </View>
        <Text className="text-text-primary text-2xl font-bold">Settings</Text>
      </View>

      {/* ── MODEL ─────────────────────────────────────────────────────────────── */}
      <SectionTitle>Model</SectionTitle>
      <Pressable
        onPress={() => setPickerVisible(true)}
        accessibilityRole="button"
        className="bg-surface-secondary rounded-lg px-4 py-3 mb-2 flex-row items-center"
      >
        <View className="w-9 h-9 rounded-lg bg-surface-tertiary items-center justify-center mr-3">
          <HardDrive size={18} color="#6366f1" />
        </View>
        <View className="flex-1">
          <Text className="text-text-primary font-semibold text-sm">
            {activeModel ? activeModel.name.replace(' SpinQuant', '') : 'No model selected'}
          </Text>
          <Text className="text-text-muted text-xs mt-0.5">
            {activeModel
              ? `${formatSize(activeModel.sizeBytes)} on device · ${activeModel.parameterCount}`
              : 'Pick a model to start chatting'}
          </Text>
        </View>
        <View className="mr-2">{modelStatusBadge}</View>
        <ChevronRight size={18} color="#525252" />
      </Pressable>

      {/* ── MEMORY ────────────────────────────────────────────────────────────── */}
      <SectionTitle>Memory</SectionTitle>

      <View className="bg-surface-secondary rounded-lg px-4 py-3 mb-2 flex-row items-center">
        <View className="w-9 h-9 rounded-lg bg-surface-tertiary items-center justify-center mr-3">
          <MessageSquare size={18} color="#6366f1" />
        </View>
        <View className="flex-1">
          <Text className="text-text-primary font-semibold text-sm">Conversations</Text>
          <Text className="text-text-muted text-xs mt-0.5">Stored on-device in SQLite</Text>
        </View>
        <Text className="text-text-secondary text-sm font-medium">
          {conversationsCount} {conversationsCount === 1 ? 'chat' : 'chats'}
        </Text>
      </View>

      <Pressable
        onPress={() => void handleExportMemories()}
        accessibilityRole="button"
        className="bg-surface-secondary rounded-lg px-4 py-3 mb-2 flex-row items-center"
      >
        <View className="w-9 h-9 rounded-lg bg-surface-tertiary items-center justify-center mr-3">
          <Share2 size={18} color="#6366f1" />
        </View>
        <View className="flex-1">
          <Text className="text-text-primary font-semibold text-sm">Export memories</Text>
          <Text className="text-text-muted text-xs mt-0.5">
            {factsCount} {factsCount === 1 ? 'fact' : 'facts'} as JSON
          </Text>
        </View>
        <ChevronRight size={18} color="#525252" />
      </Pressable>

      <Pressable
        onPress={handleClearMemories}
        disabled={memoryEmpty}
        accessibilityRole="button"
        className={`bg-surface-secondary rounded-lg px-4 py-3 mb-2 flex-row items-center ${
          memoryEmpty ? 'opacity-40' : ''
        }`}
      >
        <View className="w-9 h-9 rounded-lg bg-danger/10 items-center justify-center mr-3">
          <Trash2 size={18} color="#ef4444" />
        </View>
        <View className="flex-1">
          <Text className="text-danger font-semibold text-sm">Clear all memories</Text>
          <Text className="text-text-muted text-xs mt-0.5">Deletes chats and remembered facts</Text>
        </View>
        <ChevronRight size={18} color="#525252" />
      </Pressable>

      {/* ── PERMISSIONS ───────────────────────────────────────────────────────── */}
      <SectionTitle>Permissions</SectionTitle>
      {skills.skills.length === 0 ? (
        <View className="bg-surface-secondary rounded-lg px-4 py-3 mb-2">
          <Text className="text-text-muted text-sm">
            Enable skills to manage tool permissions.
          </Text>
        </View>
      ) : (
        skills.skills.map((skill) =>
          Object.values(skill.tools).map((tool) => {
            const permission = skills.toolPermissions[tool.definition.name] ?? 'ask';
            const meta = PERMISSION_META[permission];
            const Icon = skillIconFor(skill.metadata.name);
            const color = skillColorFor(skill.metadata.name);
            return (
              <Pressable
                key={tool.definition.name}
                onPress={() =>
                  skills.setToolPermission(tool.definition.name, NEXT_PERMISSION[permission])
                }
                accessibilityRole="button"
                accessibilityLabel={`${tool.definition.name} permission: ${meta.label}. Tap to change.`}
                className="bg-surface-secondary rounded-lg px-4 py-3 mb-2 flex-row items-center"
              >
                <View
                  className="w-9 h-9 rounded-lg items-center justify-center mr-3"
                  style={{ backgroundColor: '#1c1c1c' }}
                >
                  <Icon size={18} color={color} />
                </View>
                <View className="flex-1 mr-2">
                  <Text className="text-text-primary font-mono text-sm font-medium">
                    {tool.definition.name}
                  </Text>
                  <Text className="text-text-muted text-xs mt-0.5">
                    {skillDisplayName(skill.metadata.name)} skill · tap to cycle
                  </Text>
                </View>
                <View className="flex-row items-center px-3 py-1.5 rounded-full bg-surface-tertiary">
                  <View className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: meta.dotColor }} />
                  <Text className={`text-xs font-medium ${meta.textClass}`}>{meta.label}</Text>
                </View>
              </Pressable>
            );
          }),
        )
      )}

      {/* ── ABOUT ─────────────────────────────────────────────────────────────── */}
      <SectionTitle>About</SectionTitle>

      <Pressable
        onPress={() => setHowExpanded((v) => !v)}
        accessibilityRole="button"
        className="bg-surface-secondary rounded-lg px-4 py-3 mb-2"
      >
        <View className="flex-row items-center">
          <View className="w-9 h-9 rounded-lg bg-surface-tertiary items-center justify-center mr-3">
            <ShieldCheck size={18} color="#6366f1" />
          </View>
          <View className="flex-1">
            <Text className="text-text-primary font-semibold text-sm">How it works</Text>
            <Text className="text-text-muted text-xs mt-0.5">
              On-device AI — no cloud, ever
            </Text>
          </View>
          {howExpanded ? (
            <ChevronUp size={18} color="#525252" />
          ) : (
            <ChevronDown size={18} color="#525252" />
          )}
        </View>
        {howExpanded && (
          <Text className="text-text-secondary text-sm leading-relaxed mt-3">
            PocketSage runs Llama 3.2 on your phone with ExecuTorch. Every reply, memory, and
            skill call happens on-device — your data never leaves this device. Downloads only
            happen for the model itself (Hugging Face), never for your content.
          </Text>
        )}
      </Pressable>

      <View className="bg-surface-secondary rounded-lg px-4 py-3 mb-2 flex-row items-center">
        <View className="w-9 h-9 rounded-lg bg-surface-tertiary items-center justify-center mr-3">
          <FileText size={18} color="#a3a3a3" />
        </View>
        <Text className="text-text-primary font-semibold text-sm flex-1">Version</Text>
        <Text className="text-text-secondary text-sm">v{APP_VERSION}</Text>
      </View>

      {ABOUT_LINKS.map(({ key, label, icon: Icon, url }) => (
        <Pressable
          key={key}
          onPress={() => openLink(url)}
          accessibilityRole="link"
          className="bg-surface-secondary rounded-lg px-4 py-3 mb-2 flex-row items-center"
        >
          <View className="w-9 h-9 rounded-lg bg-surface-tertiary items-center justify-center mr-3">
            <Icon size={18} color="#a3a3a3" />
          </View>
          <Text className="text-text-primary font-semibold text-sm flex-1">{label}</Text>
          <ChevronRight size={18} color="#525252" />
        </Pressable>
      ))}

      {/* Model picker */}
      <ModelPicker visible={pickerVisible} onClose={() => setPickerVisible(false)} />
    </ScrollView>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2 mt-5 ml-1">
      {children}
    </Text>
  );
}

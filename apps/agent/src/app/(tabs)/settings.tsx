import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Settings, Cpu, Brain, Info, Trash2, ChevronRight } from 'lucide-react-native';
import { useModels } from '@/hooks/useModels';
import { useMemory } from '@/hooks/useMemory';
import { APP_VERSION } from '@/lib/constants';

export default function SettingsTab() {
  const { activeModel, isReady, isInitialized } = useModels();
  const { facts, clearAll } = useMemory();

  const handleClearMemory = () => {
    Alert.alert(
      'Clear All Memory',
      'This will delete all conversation memories and facts. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => clearAll() },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text className="text-text-primary text-2xl font-bold pt-4 pb-6">Settings</Text>

        {/* Model */}
        <Text className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2 ml-1">
          Model
        </Text>
        <Pressable className="bg-surface-secondary rounded-xl px-4 py-3.5 mb-2 flex-row items-center justify-between active:opacity-80">
          <View className="flex-row items-center flex-1">
            <Cpu size={18} color="#6366f1" />
            <View className="ml-3 flex-1">
              <Text className="text-text-primary text-sm font-medium">
                {activeModel?.name ?? 'No model selected'}
              </Text>
              <Text className="text-text-muted text-xs mt-0.5">
                {isReady ? 'Ready' : isInitialized ? 'Download required' : 'Initializing...'}
              </Text>
            </View>
          </View>
          <ChevronRight size={16} color="#525252" />
        </Pressable>

        {/* Memory */}
        <Text className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2 ml-1 mt-6">
          Memory
        </Text>
        <View className="bg-surface-secondary rounded-xl px-4 py-3.5 mb-2 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Brain size={18} color="#6366f1" />
            <Text className="text-text-primary text-sm font-medium ml-3">Facts remembered</Text>
          </View>
          <Text className="text-text-secondary text-sm">{facts.length}</Text>
        </View>
        <Pressable
          onPress={handleClearMemory}
          className="bg-surface-secondary rounded-xl px-4 py-3.5 mb-2 flex-row items-center active:opacity-80"
        >
          <Trash2 size={18} color="#ef4444" />
          <Text className="text-danger text-sm font-medium ml-3">Clear all memory</Text>
        </Pressable>

        {/* About */}
        <Text className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2 ml-1 mt-6">
          About
        </Text>
        <View className="bg-surface-secondary rounded-xl px-4 py-3.5 mb-2">
          <View className="flex-row items-center mb-3">
            <Info size={18} color="#6366f1" />
            <View className="ml-3 flex-1">
              <Text className="text-text-primary text-sm font-medium">How it works</Text>
              <Text className="text-text-secondary text-xs mt-0.5">
                PocketSage runs Llama 3.2 entirely on your device. No data leaves your phone.
                The model was downloaded once and verified with SHA-256 hashing. All inference
                happens locally. Your conversations, calendar, health data, and memories stay
                on this device.
              </Text>
            </View>
          </View>
        </View>
        <View className="bg-surface-secondary rounded-xl px-4 py-3.5 mb-2 flex-row justify-between">
          <Text className="text-text-secondary text-sm">Version</Text>
          <Text className="text-text-primary text-sm font-medium">{APP_VERSION}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

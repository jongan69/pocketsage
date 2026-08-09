import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator } from 'react-native';
import { ConversationStoreProvider } from '@/stores/conversation-store-provider';
import { ModelStoreProvider } from '@/stores/model-store-provider';
import { SkillStoreProvider } from '@/stores/skill-store-provider';
import { MemoryStoreProvider } from '@/stores/memory-store-provider';
import { useModelStore } from '@/stores/model-store';
import { useMemoryStore } from '@/stores/memory-store';
import {
  calendarSkill,
} from '@/skills/calendar/skill';
import {
  remindersSkill,
} from '@/skills/reminders/skill';
import {
  healthSkill,
} from '@/skills/health/skill';
import {
  filesSkill,
} from '@/skills/files/skill';
import {
  contactsSkill,
} from '@/skills/contacts/skill';
import { useSkillStore } from '@/stores/skill-store';

SplashScreen.preventAutoHideAsync();

function Initializer({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modelStore = useModelStore();
  const memoryStore = useMemoryStore();
  const skillStore = useSkillStore();

  useEffect(() => {
    async function init() {
      try {
        // Load bundled skills
        skillStore.loadBundledSkill(calendarSkill);
        skillStore.loadBundledSkill(remindersSkill);
        skillStore.loadBundledSkill(healthSkill);
        skillStore.loadBundledSkill(filesSkill);
        skillStore.loadBundledSkill(contactsSkill);

        // Initialize model runtime
        await modelStore.initialize();

        // Initialize memory
        await memoryStore.initialize();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Initialization failed');
      } finally {
        setReady(true);
        await SplashScreen.hideAsync();
      }
    }
    init();
  }, []);

  if (!ready) {
    return (
      <View className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator size="large" color="#6366f1" />
        <Text className="text-text-secondary mt-4 text-base">
          Waking up your on-device AI...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-surface items-center justify-center px-8">
        <Text className="text-danger text-lg font-semibold mb-2">
          Initialization Error
        </Text>
        <Text className="text-text-secondary text-center">{error}</Text>
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <ModelStoreProvider>
      <SkillStoreProvider>
        <ConversationStoreProvider>
          <MemoryStoreProvider>
            <Initializer>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: '#0a0a0a' },
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="onboarding"
                  options={{ presentation: 'fullScreenModal', headerShown: false }}
                />
                <Stack.Screen
                  name="skill/[name]"
                  options={{ presentation: 'modal', headerShown: false }}
                />
                <Stack.Screen
                  name="conversation/[id]"
                  options={{ animation: 'slide_from_right', headerShown: false }}
                />
              </Stack>
            </Initializer>
          </MemoryStoreProvider>
        </ConversationStoreProvider>
      </SkillStoreProvider>
    </ModelStoreProvider>
  );
}

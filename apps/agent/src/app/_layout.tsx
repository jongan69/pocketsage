import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../../global.css';
import { initializeStores, StoreProviders } from '@/stores/providers';
import { loadAppFonts } from '@/lib/fonts';
import { readJson } from '@/lib/persistence';
import { STORAGE_KEYS } from '@/lib/constants';

void SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Boot sequence: load fonts (with system fallback) and initialize every
 * store (SQLite conversations, model manager, skills, memory). Keeps the
 * native splash screen visible until the app is usable.
 */
function Initializer({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await loadAppFonts();
        await initializeStores();
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Initialization failed');
        }
      } finally {
        await SplashScreen.hideAsync().catch(() => {});
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // First-launch redirect — runs after the navigator has mounted.
  useEffect(() => {
    if (!ready || error) return;
    readJson<boolean>(STORAGE_KEYS.ONBOARDING_COMPLETE, false)
      .then((onboardingComplete) => {
        if (!onboardingComplete) {
          router.replace('/onboarding');
        }
      })
      .catch(() => {
        // Default to the tabs; onboarding stays reachable from settings.
      });
  }, [ready, error]);

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
        <Text className="text-danger text-lg font-semibold mb-2">Initialization Error</Text>
        <Text className="text-text-secondary text-center">{error}</Text>
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProviders>
        <Initializer>
          <StatusBar style="light" backgroundColor="#0a0a0a" />
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
      </StoreProviders>
    </SafeAreaProvider>
  );
}

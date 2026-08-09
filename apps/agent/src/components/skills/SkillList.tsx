import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, RefreshControl, Animated } from 'react-native';
import { router } from 'expo-router';
import { Puzzle, RefreshCw } from 'lucide-react-native';
import { useSkillStore } from '@/stores/skill-store';
import { Button } from '@/components/ui/Button';
import { SkillCard } from './SkillCard';

/**
 * Full skill browser: list of bundled skills with enable toggles, pull to
 * refresh, skeleton loading, and empty/error states.
 */
export function SkillList() {
  const { skills, enabledSkills, toggleSkill, loadBundledSkills, isInitialized } = useSkillStore();
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [skeletonDone, setSkeletonDone] = useState(false);

  const refresh = useCallback(async () => {
    try {
      loadBundledSkills();
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load skills');
    }
  }, [loadBundledSkills]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // Kick off loading on mount (idempotent — store guards re-registration).
  useEffect(() => {
    if (!isInitialized && skills.length === 0) {
      refresh();
    }
    // Give the skeleton a minimum presence so the UI never flashes.
    const t = setTimeout(() => setSkeletonDone(true), 350);
    return () => clearTimeout(t);
  }, [isInitialized, skills.length, refresh]);

  const loading = !isInitialized || (!skeletonDone && skills.length === 0);

  // ── Error state ────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-14 h-14 rounded-2xl bg-danger/10 items-center justify-center mb-4">
          <RefreshCw size={26} color="#ef4444" />
        </View>
        <Text className="text-text-primary font-semibold text-base mb-1">
          Couldn't load skills
        </Text>
        <Text className="text-text-secondary text-sm text-center mb-6">{loadError}</Text>
        <Button variant="primary" onPress={handleRefresh}>
          Retry
        </Button>
      </View>
    );
  }

  // ── Skeleton loading ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <View className="flex-1 px-4 pt-6">
        <View className="mb-4 px-1">
          <View className="h-6 w-24 bg-surface-tertiary rounded-md mb-2" />
          <View className="h-3.5 w-56 bg-surface-tertiary rounded" />
        </View>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  const enabledCount = skills.filter((s) => enabledSkills.has(s.metadata.name)).length;

  // ── Empty state ────────────────────────────────────────────────────────────
  if (skills.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-14 h-14 rounded-2xl bg-surface-tertiary items-center justify-center mb-4">
          <Puzzle size={26} color="#a3a3a3" />
        </View>
        <Text className="text-text-primary font-semibold text-base mb-1">No skills available</Text>
        <Text className="text-text-secondary text-sm text-center">
          Pull down to refresh and check again.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 px-4"
      contentContainerStyle={{ paddingVertical: 8 }}
      data={skills}
      keyExtractor={(skill) => skill.metadata.name}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#6366f1"
          colors={['#6366f1']}
          progressBackgroundColor="#141414"
        />
      }
      ListHeaderComponent={
        <View className="mb-4 px-1">
          <View className="flex-row items-baseline justify-between">
            <Text className="text-text-primary text-2xl font-bold">Skills</Text>
            <Text className="text-text-muted text-xs">
              {enabledCount}/{skills.length} enabled
            </Text>
          </View>
          <Text className="text-text-secondary text-sm mt-1">
            Enable skills to let PocketSage do more
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <SkillCard
          skill={item.metadata}
          enabled={enabledSkills.has(item.metadata.name)}
          onToggle={(enabled) => toggleSkill(item.metadata.name, enabled)}
          onPress={() => router.push(`/skill/${item.metadata.name}`)}
        />
      )}
    />
  );
}

/** Pulsing placeholder card shown while bundled skills are loading. */
function SkeletonCard() {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={{ opacity: pulse }}
      className="bg-surface-secondary rounded-xl p-4 mb-3 flex-row items-center"
    >
      <View className="w-11 h-11 rounded-xl bg-surface-tertiary mr-3" />
      <View className="flex-1">
        <View className="h-4 w-2/5 bg-surface-tertiary rounded mb-2" />
        <View className="h-3 w-4/5 bg-surface-tertiary rounded" />
      </View>
    </Animated.View>
  );
}

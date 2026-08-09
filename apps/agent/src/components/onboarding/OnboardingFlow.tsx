import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, ArrowRight, Check } from 'lucide-react-native';
import { writeJson } from '@/lib/persistence';
import { STORAGE_KEYS } from '@/lib/constants';
import { WelcomeStep } from './WelcomeStep';
import { ModelDownloadStep } from './ModelDownloadStep';
import { SkillsSetupStep } from './SkillsSetupStep';

const STEPS = ['welcome', 'model', 'skills'] as const;

/** Three-step first-launch flow: welcome → model download → skills. */
export function OnboardingFlow() {
  const [stepIndex, setStepIndex] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const animateStep = useCallback(
    (direction: 1 | -1) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      translateX.setValue(direction * 44);
      opacity.setValue(0.2);
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
    },
    [translateX, opacity],
  );

  const go = useCallback(
    (direction: 1 | -1) => {
      setStepIndex((current) => {
        const next = current + direction;
        if (next < 0 || next >= STEPS.length) return current;
        animateStep(direction);
        return next;
      });
    },
    [animateStep],
  );

  const finish = useCallback(async () => {
    try {
      await writeJson(STORAGE_KEYS.ONBOARDING_COMPLETE, {
        completed: true,
        completedAt: new Date().toISOString(),
      });
    } catch {
      // Onboarding still proceeds even if persistence fails.
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.replace('/(tabs)');
  }, []);

  const isLast = stepIndex === STEPS.length - 1;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Progress dots */}
      <View className="flex-row justify-center pt-6 pb-2 gap-2">
        {STEPS.map((_, i) => (
          <View
            key={i}
            className={`h-2.5 rounded-full ${
              i === stepIndex
                ? 'w-6 bg-accent'
                : i < stepIndex
                  ? 'w-2.5 bg-accent-muted'
                  : 'w-2.5 bg-surface-tertiary'
            }`}
          />
        ))}
      </View>

      {/* Step content */}
      <View className="flex-1 px-6 pt-2">
        <Animated.View key={stepIndex} style={{ opacity, transform: [{ translateX }] }} className="flex-1">
          {stepIndex === 0 && <WelcomeStep />}
          {stepIndex === 1 && <ModelDownloadStep onSkip={() => go(1)} />}
          {stepIndex === 2 && <SkillsSetupStep />}
        </Animated.View>
      </View>

      {/* Navigation */}
      <View className="px-6 pb-8 pt-2 flex-row items-center justify-between">
        {stepIndex > 0 ? (
          <Pressable onPress={() => go(-1)} accessibilityRole="button" className="flex-row items-center py-3 px-2">
            <ChevronLeft size={18} color="#a3a3a3" />
            <Text className="text-text-secondary ml-1 font-medium">Back</Text>
          </Pressable>
        ) : (
          <View />
        )}

        <Pressable
          onPress={isLast ? () => void finish() : () => go(1)}
          accessibilityRole="button"
          className="bg-accent rounded-full px-6 py-3.5 flex-row items-center active:opacity-90"
        >
          <Text className="text-white font-semibold mr-2">
            {isLast ? 'Get Started' : 'Next'}
          </Text>
          {isLast ? <Check size={18} color="#ffffff" /> : <ArrowRight size={18} color="#ffffff" />}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
